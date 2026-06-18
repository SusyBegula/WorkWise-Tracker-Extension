import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { pgPool, querySQLite } from "@/lib/db"

export async function GET() {
  try {
    // 1. Authenticate session
    const session = await getSession()
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Fetch master employees list from Neon PostgreSQL (Read-only)
    const pgResult = await pgPool.query(
      "SELECT email, name, role, is_active FROM users WHERE role = 'employee' OR role = 'admin' ORDER BY name ASC"
    )
    const employees = pgResult.rows

    // 3. Query local SQLite for active event counts and timestamps per user
    const userStats = await querySQLite<{ email: string; event_count: number; last_active: string }>(
      `SELECT email, COUNT(*) as event_count, MAX(timestamp) as last_active 
       FROM activity_logs 
       GROUP BY email`
    )

    // 4. Query local SQLite for event type distribution
    const eventDistribution = await querySQLite<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) as count 
       FROM activity_logs 
       GROUP BY event_type`
    )

    // 5. Query local SQLite for screenshots count per user
    const screenshotCounts = await querySQLite<{ email: string; count: number }>(
      `SELECT email, COUNT(*) as count 
       FROM screenshots 
       GROUP BY email`
    )

    // 6. Query local SQLite for hourly activity load (last 24 hours)
    // We take substring starting at index 12 (length 2) for HH hour format: "2026-06-18T09:47:29" -> "09"
    const hourlyActivity = await querySQLite<{ hour: string; count: number }>(
      `SELECT SUBSTR(timestamp, 12, 2) as hour, COUNT(*) as count 
       FROM activity_logs 
       GROUP BY hour 
       ORDER BY hour ASC`
    )

    // Combine PostgreSQL user records with SQLite telemetry statistics
    const teamMembersData = employees.map(emp => {
      const stats = userStats.find(s => s.email.toLowerCase() === emp.email.toLowerCase())
      const screens = screenshotCounts.find(s => s.email.toLowerCase() === emp.email.toLowerCase())
      
      // Determine if active recently (within the last 5 minutes)
      let isTrackingActive = false
      if (stats && stats.last_active) {
        const lastActiveTime = new Date(stats.last_active).getTime()
        // If last log is within 5 minutes, consider user currently online
        isTrackingActive = (Date.now() - lastActiveTime) < 5 * 60 * 1000
      }

      return {
        email: emp.email,
        name: emp.name,
        role: emp.role,
        eventCount: stats ? stats.event_count : 0,
        screenshotCount: screens ? screens.count : 0,
        lastActive: stats ? stats.last_active : null,
        isTrackingActive
      }
    })

    return NextResponse.json({
      teamMembers: teamMembersData,
      eventDistribution,
      hourlyActivity
    })
  } catch (err: any) {
    console.error("Overview API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
