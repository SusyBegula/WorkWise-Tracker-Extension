import express from "express"
import cors from "cors"
import path from "path"
import dotenv from "dotenv"
import pg from "pg"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import rateLimit from "express-rate-limit"
import { fileURLToPath } from "url"
import { initializeTelemetryTables, dayKey } from "./db/schema.js"
import { normalizeEvent } from "./ingest/sanitize.js"
import { persistBatch } from "./ingest/writePath.js"
import { startRollupScheduler } from "./rollup.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env variables
dotenv.config({ path: path.join(__dirname, ".env") })

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.")
  process.exit(1)
}

// Behind Render's proxy, trust the first hop so rate-limit sees real client IPs
app.set("trust proxy", 1)

// Restrict CORS to the extension origin(s). Requests with no Origin
// (curl, health checks, some service-worker fetches) are allowed through;
// the JWT is the real authentication boundary.
const allowedOrigins = (process.env.ALLOWED_EXTENSION_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true)
      }
      return cb(new Error("Not allowed by CORS"))
    }
  })
)
app.use(express.json({ limit: "1mb" }))

const { Pool } = pg

// Return DATE columns (e.g. the `day` rollup key, type OID 1082) as plain
// 'YYYY-MM-DD' strings instead of timezone-shifted JS Dates — cleaner JSON.
pg.types.setTypeParser(1082, (v) => v)

// Build a pool config for managed Postgres (Supabase/Neon/Render). These
// providers terminate TLS with cert chains node-postgres won't verify by
// default. Newer pg also treats `sslmode=require` in the URL as full
// verification, which rejects Supabase's self-signed chain — so we strip
// sslmode/channel_binding from the URL and govern TLS via our own ssl option.
function buildPoolConfig(connectionString, extra = {}) {
  const cfg = { ssl: { rejectUnauthorized: false }, ...extra }
  if (connectionString) {
    try {
      const u = new URL(connectionString)
      u.searchParams.delete("sslmode")
      u.searchParams.delete("channel_binding")
      cfg.connectionString = u.toString()
    } catch {
      cfg.connectionString = connectionString
    }
  }
  return cfg
}

// Connection pool for auth (read-only production DB)
const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL))

// Handle unexpected errors on idle pool clients
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err)
})

// Setup a separate, writable Postgres pool for telemetry. Kept fully
// separate from the read-only auth DB above. Connection string should carry
// ?sslmode=require for managed providers (Neon/Render).
const telemetryPool = new Pool(
  buildPoolConfig(process.env.TELEMETRY_DATABASE_URL, {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })
)

telemetryPool.on("error", (err) => {
  console.error("Unexpected error on idle telemetry database client", err)
})

// Telemetry schema (tables, partitions, rollups) lives in ./db/schema.js and
// the ingestion/sanitization in ./ingest/*. initializeTelemetryTables(pool) is
// imported and run at startup below.


// Database helper to check if email exists
async function emailExists(email) {
  if (!email) return false
  try {
    const result = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)",
      [email.toLowerCase().trim()]
    )
    return result.rows[0].exists
  } catch (error) {
    console.error("Database query error checking email:", error)
    return false
  }
}

// Verify a signed JWT from the Authorization header. Returns the decoded
// payload, or null if missing/invalid/expired.
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null
  const tokenStr = authHeader.substring(7) // Remove 'Bearer '
  try {
    return jwt.verify(tokenStr, JWT_SECRET, { algorithms: ["HS256"] })
  } catch (e) {
    return null
  }
}

// Live status from a user_status row: offline if stale or no open session,
// else idle if the OS reported idle/locked, else active.
const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_MS || 90000)
function deriveStatus(row, nowMs) {
  if (!row) return "offline"
  const last = new Date(row.last_event_at).getTime()
  if (nowMs - last > OFFLINE_THRESHOLD_MS || !row.session_open) return "offline"
  if (row.last_idle_state === "idle" || row.last_idle_state === "locked") return "idle"
  return "active"
}

// Dashboard read endpoints require a manager (admin/pm) per the auth DB role.
// NOTE: PMs currently see all employees; scoping a PM to only their team needs
// the PM-portal allocation data (deferred correlation work).
async function requireManager(req, res, next) {
  const decoded = verifyToken(req.headers.authorization)
  if (!decoded || !decoded.email) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token." })
  }
  const email = decoded.email.toLowerCase().trim()
  try {
    const r = await pool.query("SELECT role, is_active FROM users WHERE email = $1", [email])
    if (r.rows.length === 0) return res.status(403).json({ error: "Forbidden: unknown account." })
    const { role, is_active } = r.rows[0]
    if (is_active === false) return res.status(403).json({ error: "Forbidden: inactive account." })
    if (role !== "admin" && role !== "pm") {
      return res.status(403).json({ error: "Forbidden: manager access required." })
    }
    req.viewer = { email, role }
    next()
  } catch (e) {
    console.error("requireManager error:", e.message)
    res.status(500).json({ error: "Authorization check failed" })
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// Strict rate limiter on login to blunt credential stuffing against bcrypt
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." }
})

// Looser limiter on telemetry ingestion to cap pathological floods.
// One user batches every ~1-30s, so a generous per-IP cap is safe.
const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
})

// Endpoint for user login
app.post("/api/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body

  if (!email) {
    return res.status(400).json({ error: "Email is required" })
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" })
  }

  const normalizedEmail = email.toLowerCase().trim()
  
  try {
    const result = await pool.query(
      "SELECT id, email, name, password_hash, is_active FROM users WHERE email = $1",
      [normalizedEmail]
    )

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Forbidden: Your email is not whitelisted." })
    }

    const user = result.rows[0]
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      return res.status(401).json({ error: "Invalid password." })
    }

    // Reject deactivated/offboarded accounts (only explicit false blocks; null/true allowed)
    if (user.is_active === false) {
      return res.status(403).json({ error: "Forbidden: Your account is inactive." })
    }

    // Generate a signed JWT (HS256). The client treats this token as opaque.
    const token = jwt.sign({ email: normalizedEmail }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "12h"
    })

    console.log(`\n\x1b[32m🔑 User logged in successfully: ${normalizedEmail}\x1b[0m\n`)

    res.json({ token, email: normalizedEmail, name: user.name })
  } catch (error) {
    console.error("Login route error:", error)
    res.status(500).json({ error: "Internal server error during authentication" })
  }
})

// Helper to format milliseconds into human-readable duration
function formatDuration(ms) {
  if (ms === undefined || ms === null) return "0s"
  const totalSecs = Math.floor(ms / 1000)
  const hrs = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  
  const parts = []
  if (hrs > 0) parts.push(`${hrs}h`)
  if (mins > 0) parts.push(`${mins}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  return parts.join(" ")
}

// Endpoint to receive activity data from the extension
app.post("/api/activity", activityLimiter, async (req, res) => {
  const authHeader = req.headers.authorization
  const decoded = verifyToken(authHeader)

  if (!decoded || !decoded.email) {
    console.log(`\x1b[31m⚠️  Unauthorized activity attempt: Missing or invalid token.\x1b[0m`)
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token." })
  }

  const employeeEmail = decoded.email.toLowerCase().trim()
  try {
    const exists = await emailExists(employeeEmail)
    if (!exists) {
      console.log(`\x1b[31m⚠️  Forbidden activity attempt: ${employeeEmail} is not whitelisted.\x1b[0m`)
      return res.status(403).json({ error: "Forbidden: Employee is not whitelisted." })
    }
  } catch (error) {
    console.error("Activity route error checking whitelist:", error)
    return res.status(500).json({ error: "Internal server error during telemetry validation" })
  }

  // Handle both batched array payloads and single event objects
  const events = Array.isArray(req.body) ? req.body : [req.body]

  // Style console outputs using ANSI escape codes for readability
  const blue = "\x1b[34m"
  const green = "\x1b[32m"
  const yellow = "\x1b[33m"
  const red = "\x1b[31m"
  const cyan = "\x1b[36m"
  const reset = "\x1b[0m"
  const bold = "\x1b[1m"
  const gray = "\x1b[90m"

  const TASK_LIFECYCLE_EVENTS = ["TASK_STARTED", "TASK_SKIPPED", "TASK_EXITED"]

  // Normalize + sanitize the batch (drop unknown/malformed; counted below).
  const now = Date.now()
  const normalized = events.map((e) => normalizeEvent(e, now)).filter(Boolean)
  const dropped = events.length - normalized.length

  // Operator console logging (no raw metadata values — see redaction below).
  for (const event of events) {
    const { eventType, url, title, timestamp, metadata } = event
    const timeStr = new Date(timestamp).toLocaleTimeString()

    if (eventType === "SESSION_STOPPED") {
      console.log(`\n${bold}${red}============================================================${reset}`)
      console.log(`${bold}${red}🛑 SESSION STOPPED [${timeStr}] - User: ${employeeEmail}${reset}`)
      console.log(`${bold}Summary Report:${reset}`)
      console.log(`  • ${bold}Total Session Duration:${reset}  ${formatDuration(metadata.totalSessionTimeMs)}`)
      console.log(`  • ${bold}Actual Working Time:${reset}     ${cyan}${formatDuration(metadata.totalActiveTimeMs)}${reset}`)
      console.log(`  • ${bold}Total Paused Duration:${reset}   ${yellow}${formatDuration(metadata.totalPausedTimeMs)}${reset}`)
      console.log(`  • ${bold}Total Pauses:${reset}             ${metadata.pauseCount}`)
      console.log(`  • ${bold}Total Events Captured:${reset}   ${green}${metadata.totalEvents}${reset}`)
      
      if (metadata.pauseHistory && metadata.pauseHistory.length > 0) {
        console.log(`\n  ${bold}Pause Breakdown:${reset}`)
        metadata.pauseHistory.forEach((pause, idx) => {
          const pauseTime = new Date(pause.pausedAt).toLocaleTimeString()
          console.log(`    ${gray}[#${idx + 1}] Paused at ${pauseTime} for ${formatDuration(pause.durationMs)}${reset}`)
        })
      }
      console.log(`${bold}${red}============================================================${reset}\n`)
    } else if (eventType === "SESSION_STARTED") {
      console.log(`\n${bold}${green}============================================================${reset}`)
      console.log(`${bold}${green}🚀 SESSION STARTED [${timeStr}] - User: ${employeeEmail}${reset}`)
      console.log(`  Tracking activated. Listening to browser events...`)
      console.log(`${bold}${green}============================================================${reset}\n`)

    } else if (TASK_LIFECYCLE_EVENTS.includes(eventType)) {
      const icon = eventType === "TASK_STARTED" ? "▶️" :
                   eventType === "TASK_SKIPPED" ? "⏭️" : "🚪"
      const color = eventType === "TASK_SKIPPED" ? yellow :
                    eventType === "TASK_EXITED" ? red : cyan
      console.log(`\n${bold}${color}${icon} TASK EVENT [${timeStr}]: ${eventType} - User: ${employeeEmail}${reset}`)
      console.log(`  ${blue}Project:${reset} ${metadata?.projectId ?? "N/A"}`)
      console.log(`  ${blue}Data ID:${reset} ${metadata?.dataId ?? "N/A"}`)

      if (url) console.log(`  ${green}URL:${reset}     ${url}`)
      console.log(`${gray}------------------------------------------------------------${reset}`)
    } else if (eventType === "ENCORD_PAGE_VIEW") {
      console.log(`\n${bold}${cyan}[${timeStr}] ENCORD_PAGE_VIEW - User: ${employeeEmail}${reset}`)
      console.log(`  Category: ${metadata?.category ?? "unknown"}  |  URL: ${url}`)
      console.log(`${gray}------------------------------------------------------------${reset}`)
    } else {

      // Normal activity event logging
      console.log(`\n${bold}[${timeStr}] EVENT: ${eventType} - User: ${employeeEmail}${reset}`)
      
      if (url) {
        console.log(`  ${green}URL:${reset}   ${url}`)
      }
      if (title) {
        console.log(`  ${blue}Title:${reset} ${title}`)
      }
      // (raw metadata values are not logged — may contain keystrokes / click text)
      console.log(`${gray}------------------------------------------------------------${reset}`)
    }
  }

  // Persist the batch transactionally. On failure return 500 so the extension
  // re-buffers the events instead of dropping them.
  try {
    await persistBatch(telemetryPool, employeeEmail, normalized)
  } catch (error) {
    console.error("Failed to persist telemetry batch:", error)
    return res.status(500).json({ error: "Failed to persist telemetry" })
  }
  if (dropped > 0) {
    console.log(`\x1b[90m  (${dropped} event(s) dropped as unknown/malformed)\x1b[0m`)
  }

  res.status(200).json({ success: true })
})

// ── Dashboard read endpoints (manager-only) ────────────────────────────────

// Processed insights for one employee (default last 7 days). Cheap rollup reads.
app.get("/api/insights/:email", requireManager, async (req, res) => {
  const email = req.params.email.toLowerCase().trim()
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90)
  const today = dayKey(new Date())
  const from = dayKey(new Date(Date.now() - (days - 1) * 86400000))
  try {
    const [daily, dom, sec, hourly, tasks, status, profile] = await Promise.all([
      telemetryPool.query(
        `SELECT day, active_ms, paused_ms, session_count, pause_count, focus_ratio,
                tasks_started, tasks_skipped, tasks_exited, avg_task_ms, first_active, last_active
         FROM daily_user_stats WHERE email = $1 AND day BETWEEN $2 AND $3 ORDER BY day`,
        [email, from, today]
      ),
      telemetryPool.query(
        `SELECT domain, active_ms FROM daily_domain_time WHERE email = $1 AND day = $2
         ORDER BY active_ms DESC LIMIT 10`, [email, today]
      ),
      telemetryPool.query(
        `SELECT category, active_ms FROM daily_encord_section_time WHERE email = $1 AND day = $2`,
        [email, today]
      ),
      telemetryPool.query(
        `SELECT hour, event_type, cnt FROM daily_event_counts_hourly WHERE email = $1 AND day = $2
         ORDER BY hour`, [email, today]
      ),
      telemetryPool.query(
        `SELECT project_id, data_id, started_at, ended_at, duration_ms, outcome
         FROM task_spans WHERE email = $1 AND day = $2 ORDER BY started_at DESC NULLS LAST LIMIT 50`,
        [email, today]
      ),
      telemetryPool.query(
        `SELECT last_event_at, last_idle_state, session_open FROM user_status WHERE email = $1`, [email]
      ),
      pool.query(`SELECT name, role FROM users WHERE email = $1`, [email])
    ])
    res.json({
      email,
      name: profile.rows[0]?.name ?? null,
      role: profile.rows[0]?.role ?? null,
      status: deriveStatus(status.rows[0], Date.now()),
      lastEventAt: status.rows[0]?.last_event_at ?? null,
      rangeDays: days,
      daily: daily.rows,
      today: { domainTime: dom.rows, sectionTime: sec.rows, hourly: hourly.rows, tasks: tasks.rows }
    })
  } catch (e) {
    console.error("insights error:", e.message)
    res.status(500).json({ error: "Failed to load insights" })
  }
})

// Live raw-event feed for one employee — role-gated AND audit-logged, since it
// can expose work-site keystrokes. The modal polls with ?since=<iso>.
app.get("/api/raw-events/:email", requireManager, async (req, res) => {
  const email = req.params.email.toLowerCase().trim()
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000)
  const since = req.query.since ? new Date(req.query.since) : null
  try {
    await telemetryPool.query(
      `INSERT INTO raw_log_access_audit (viewer_email, viewed_email, ip) VALUES ($1, $2, $3)`,
      [req.viewer.email, email, req.ip]
    )
    const params = [email]
    let where = "email = $1"
    if (since && !isNaN(since.getTime())) {
      params.push(since)
      where += ` AND ts > $${params.length}`
    }
    params.push(limit)
    const r = await telemetryPool.query(
      `SELECT event_type, ts, url, domain, encord_category, project_id, data_id, metadata
       FROM raw_events WHERE ${where} ORDER BY ts DESC LIMIT $${params.length}`,
      params
    )
    res.json({ email, viewer: req.viewer.email, events: r.rows })
  } catch (e) {
    console.error("raw-events error:", e.message)
    res.status(500).json({ error: "Failed to load raw events" })
  }
})

// Team overview for a day (default today): team KPIs + per-member stats/status.
app.get("/api/team/overview", requireManager, async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || "") ? req.query.day : dayKey(new Date())
  try {
    const [team, members, statuses] = await Promise.all([
      telemetryPool.query(`SELECT * FROM daily_team_stats WHERE day = $1`, [day]),
      telemetryPool.query(
        `SELECT email, active_ms, paused_ms, focus_ratio, tasks_started, tasks_skipped, session_count
         FROM daily_user_stats WHERE day = $1 ORDER BY active_ms DESC`, [day]
      ),
      telemetryPool.query(`SELECT email, last_event_at, last_idle_state, session_open FROM user_status`)
    ])
    const statusMap = new Map(statuses.rows.map((s) => [s.email, s]))
    let nameMap = new Map()
    const emails = members.rows.map((m) => m.email)
    if (emails.length) {
      const names = await pool.query(`SELECT email, name FROM users WHERE email = ANY($1)`, [emails])
      nameMap = new Map(names.rows.map((n) => [n.email.toLowerCase(), n.name]))
    }
    const now = Date.now()
    res.json({
      day,
      team: team.rows[0] ?? null,
      members: members.rows.map((m) => ({
        ...m,
        name: nameMap.get(m.email) ?? null,
        status: deriveStatus(statusMap.get(m.email), now)
      }))
    })
  } catch (e) {
    console.error("team overview error:", e.message)
    res.status(500).json({ error: "Failed to load team overview" })
  }
})

// Start the server only after telemetry tables are ready
initializeTelemetryTables(telemetryPool)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\x1b[32m\x1b[1m🚀 Activity Logging Server is running on http://localhost:${PORT}\x1b[0m`)
      console.log(`\x1b[90mWaiting for browser events from extension...\x1b[0m\n`)
    })
    // Start the background rollup job (recompute insights + retention purge).
    startRollupScheduler(telemetryPool)
  })
  .catch((err) => {
    console.error("FATAL: Failed to initialize telemetry tables. Refusing to start.", err)
    process.exit(1)
  })
