import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { querySQLite } from "@/lib/db"

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")

    if (!email) {
      return NextResponse.json({ error: "Email parameter is required" }, { status: 400 })
    }

    // Query SQLite database for last 300 logs for the selected email
    const logs = await querySQLite<{
      id: number
      email: string
      event_type: string
      url: string
      title: string
      timestamp: string
      metadata: string
    }>(
      `SELECT id, email, event_type, url, title, timestamp, metadata 
       FROM activity_logs 
       WHERE email = ? 
       ORDER BY timestamp DESC 
       LIMIT 300`,
      [email.toLowerCase().trim()]
    )

    // Parse stringified JSON metadata fields
    const parsedLogs = logs.map(log => {
      let metadataObj = {}
      if (log.metadata) {
        try {
          metadataObj = JSON.parse(log.metadata)
        } catch (e) {
          metadataObj = { raw: log.metadata }
        }
      }
      return {
        ...log,
        metadata: metadataObj
      }
    })

    // Compute stats for this specific user
    const statsResult = await querySQLite<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) as count 
       FROM activity_logs 
       WHERE email = ? 
       GROUP BY event_type`,
      [email.toLowerCase().trim()]
    )

    return NextResponse.json({
      logs: parsedLogs,
      stats: statsResult
    })
  } catch (err: any) {
    console.error("Timeline API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
