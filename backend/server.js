import express from "express"
import cors from "cors"
import path from "path"
import dotenv from "dotenv"
import pg from "pg"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import rateLimit from "express-rate-limit"
import { fileURLToPath } from "url"
import { initializeTelemetryTables } from "./db/schema.js"
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
