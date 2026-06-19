import express from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import dotenv from "dotenv"
import pg from "pg"
import bcrypt from "bcryptjs"
import sqlite3 from "sqlite3"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env variables
dotenv.config({ path: path.join(__dirname, ".env") })

const app = express()
const PORT = process.env.PORT || 3000

// Setup local screenshots directory
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots")
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

app.use(cors())
app.use(express.json({ limit: "10mb" })) // Increase payload limit to handle image data

// Setup PostgreSQL Connection Pool
const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// Handle unexpected errors on idle pool clients
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err)
})

// Setup local SQLite Database for telemetry logs
const SQLITE_DB_PATH = path.join(__dirname, "..", "shared-telemetry.db")
const db = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite database:", err)
  } else {
    console.log(`Connected to local SQLite database: ${SQLITE_DB_PATH}`)
    initializeSQLiteTables()
  }
})

// Initialize local SQLite tables for telemetry and screenshots
function initializeSQLiteTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        event_type TEXT,
        url TEXT,
        title TEXT,
        timestamp TEXT,
        metadata TEXT
      )
    `)
    db.run(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        url TEXT,
        title TEXT,
        timestamp TEXT,
        filepath TEXT
      )
    `)
    // Dedicated task lifecycle table for fast, indexed dashboard queries
    db.run(`
      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        event_type TEXT NOT NULL,
        project_id TEXT,
        data_id TEXT,
        url TEXT,
        title TEXT,
        timestamp TEXT NOT NULL,
        metadata TEXT
      )
    `)
    // Index for common dashboard queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_task_events_email ON task_events (email)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_task_events_type  ON task_events (event_type)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_task_events_data  ON task_events (data_id)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_activity_email    ON activity_logs (email)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_activity_type     ON activity_logs (event_type)`)
    console.log("Local SQLite telemetry tables initialized successfully.")
  })
}


// Helper to insert activity log into SQLite
function logToSQLite(email, eventType, url, title, timestamp, metadata) {
  const query = `
    INSERT INTO activity_logs (email, event_type, url, title, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  const metadataStr = metadata ? JSON.stringify(metadata) : null
  db.run(query, [email, eventType, url, title, timestamp, metadataStr], function (err) {
    if (err) {
      console.error("Failed to write activity log to local SQLite:", err)
    }
  })
}

// Helper to insert screenshot metadata into SQLite
function logScreenshotToSQLite(email, url, title, timestamp, filepath) {
  const query = `
    INSERT INTO screenshots (email, url, title, timestamp, filepath)
    VALUES (?, ?, ?, ?, ?)
  `
  db.run(query, [email, url, title, timestamp, filepath], function (err) {
    if (err) {
      console.error("Failed to write screenshot metadata to local SQLite:", err)
    }
  })
}

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

// Mock token parsing utility
function decodeMockToken(token) {
  if (!token || !token.startsWith("Bearer ")) return null
  const tokenStr = token.substring(7) // Remove 'Bearer '
  try {
    const parts = tokenStr.split(".")
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf8")
      return JSON.parse(payloadJson)
    }
  } catch (e) {
    return null
  }
  return null
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// Endpoint for user login
app.post("/api/login", async (req, res) => {
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
      "SELECT id, email, name, password_hash FROM users WHERE email = $1",
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

    // Generate mock JWT token: mock-header.payloadBase64.mock-signature
    const payload = { email: normalizedEmail, timestamp: Date.now() }
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64")
    const token = `mock-header.${base64Payload}.mock-signature`

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
app.post("/api/activity", async (req, res) => {
  const authHeader = req.headers.authorization
  const decoded = decodeMockToken(authHeader)

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

  for (const event of events) {
    const { eventType, url, title, timestamp, metadata } = event
    const timeStr = new Date(timestamp).toLocaleTimeString()

    // Write all events to SQLite (stripping base64 image data for screenshots to keep logs lightweight)
    if (eventType === "SCREENSHOT_CAPTURED") {
      const cleanMetadata = { ...metadata }
      delete cleanMetadata.image
      logToSQLite(employeeEmail, eventType, url, title, timestamp, cleanMetadata)
    } else {
      logToSQLite(employeeEmail, eventType, url, title, timestamp, metadata)
    }

    // Write Encord task lifecycle events to the dedicated task_events table
    const TASK_LIFECYCLE_EVENTS = ["TASK_STARTED", "TASK_COMPLETED", "TASK_SKIPPED", "TASK_EXITED"]
    if (TASK_LIFECYCLE_EVENTS.includes(eventType)) {
      const projectId = metadata?.projectId ?? null
      const dataId = metadata?.dataId ?? null
      const taskQuery = `
        INSERT INTO task_events (email, event_type, project_id, data_id, url, title, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      db.run(taskQuery, [
        employeeEmail, eventType, projectId, dataId, url, title, timestamp,
        metadata ? JSON.stringify(metadata) : null
      ], function (err) {
        if (err) console.error("Failed to write task event to SQLite:", err)
      })
    }


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
    } else if (eventType === "SCREENSHOT_CAPTURED") {
      console.log(`\n${bold}[${timeStr}] EVENT: SCREENSHOT_CAPTURED - User: ${employeeEmail}${reset}`)
      try {
        const base64Data = metadata.image.replace(/^data:image\/jpeg;base64,/, "")
        const buffer = Buffer.from(base64Data, "base64")
        
        // Sanitize tab title to make it safe for file systems
        const cleanTitle = title
          ? title.replace(/[^a-zA-Z0-9\s-_]/g, "").trim().substring(0, 50).replace(/\s+/g, "_")
          : "unknown"

        // Format date, time, and milliseconds for uniqueness
        const now = new Date()
        const dateStr = now.toISOString().split("T")[0] // YYYY-MM-DD
        const timeStrFormatted = now.toTimeString().split(" ")[0].replace(/:/g, "-") // HH-MM-SS
        const ms = String(now.getMilliseconds()).padStart(3, "0")
        
        const cleanEmail = employeeEmail.replace(/[^a-zA-Z0-9]/g, "_")
        const filename = `${cleanEmail}_${cleanTitle}_${dateStr}_${timeStrFormatted}-${ms}.jpg`
        const filepath = path.join(SCREENSHOTS_DIR, filename)
        
        fs.writeFileSync(filepath, buffer)
        console.log(`  ${green}Saved to:${reset} ${filepath}`)

        // Write screenshot record to SQLite
        logScreenshotToSQLite(employeeEmail, url, title, timestamp, filepath)
      } catch (err) {
        console.error("  Failed to save screenshot:", err)
      }
      console.log(`${gray}------------------------------------------------------------${reset}`)
    } else if (TASK_LIFECYCLE_EVENTS.includes(eventType)) {
      const icon = eventType === "TASK_STARTED" ? "▶️" :
                   eventType === "TASK_COMPLETED" ? "✅" :
                   eventType === "TASK_SKIPPED" ? "⏭️" : "🚪"
      const color = eventType === "TASK_COMPLETED" ? green :
                    eventType === "TASK_SKIPPED" ? yellow :
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
      if (metadata && Object.keys(metadata).length > 0) {
        const printMetadata = { ...metadata }
        if (printMetadata.image) {
          printMetadata.image = "[Base64 Image Data]"
        }
        console.log(`  ${yellow}Data:${reset}  ${JSON.stringify(printMetadata, null, 2).replace(/\n/g, "\n  ")}`)
      }
      console.log(`${gray}------------------------------------------------------------${reset}`)
    }
  }

  res.status(200).json({ success: true })
})

app.listen(PORT, () => {
  console.log(`\x1b[32m\x1b[1m🚀 Activity Logging Server is running on http://localhost:${PORT}\x1b[0m`)
  console.log(`\x1b[90mWaiting for browser events from extension...\x1b[0m\n`)
})
