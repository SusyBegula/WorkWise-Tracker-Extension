import path from "path"
import sqlite3 from "sqlite3"
import pg from "pg"

const { Pool } = pg

// Resolve path to the shared-telemetry.db file
// CWD is typically /home/himanshu/codes/.../work-wise-tracker/dashboard when running next dev
const isDashboardCwd = process.cwd().endsWith("dashboard")
const SQLITE_DB_PATH = isDashboardCwd
  ? path.resolve(process.cwd(), "..", "shared-telemetry.db")
  : path.resolve(process.cwd(), "shared-telemetry.db")

// Open with read/write/create permission so that Next.js doesn't fail if the database file is not yet created by the backend
export const sqliteDb = new sqlite3.Database(
  SQLITE_DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error("[Dashboard DB] Failed to open local SQLite database:", err)
    } else {
      console.log(`[Dashboard DB] Connected to local SQLite database at: ${SQLITE_DB_PATH}`)
      // Initialize tables in case dashboard is run before backend
      sqliteDb.serialize(() => {
        sqliteDb.run(`
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
        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            url TEXT,
            title TEXT,
            timestamp TEXT,
            filepath TEXT
          )
        `)
        sqliteDb.run(`
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
      })
    }
  }
)


export function querySQLite<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows as T[])
      }
    })
  })
}

// PostgreSQL (Neon DB) Pool
const pgConnectionString = process.env.DATABASE_URL
export const pgPool = new Pool({
  connectionString: pgConnectionString
})

pgPool.on("error", (err) => {
  console.error("[Dashboard DB] Unexpected PG Pool Error:", err)
})
