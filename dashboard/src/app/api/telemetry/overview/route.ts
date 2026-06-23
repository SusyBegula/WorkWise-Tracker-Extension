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

    // Compute dates relative to today
    const now = new Date()
    
    // Local start of today (e.g. 2026-06-19T00:00:00)
    const todayLocal = new Date(now)
    todayLocal.setHours(0, 0, 0, 0)
    const startOfToday = todayLocal.toISOString()

    // 7 days ago start
    const sevenDaysAgoLocal = new Date(now)
    sevenDaysAgoLocal.setDate(sevenDaysAgoLocal.getDate() - 7)
    sevenDaysAgoLocal.setHours(0, 0, 0, 0)
    const startOfSevenDaysAgo = sevenDaysAgoLocal.toISOString()

    // 3. Query SQLite for active event counts and timestamps per user (all time)
    const userStatsAllTime = await querySQLite<{ email: string; event_count: number; last_active: string }>(
      `SELECT email, COUNT(*) as event_count, MAX(timestamp) as last_active 
       FROM activity_logs 
       GROUP BY email`
    )

    // 4. Query SQLite for latest event details for each user
    const latestEvents = await querySQLite<{
      email: string
      event_type: string
      timestamp: string
      url: string | null
      title: string | null
      metadata: string | null
    }>(
      `SELECT al.email, al.event_type, al.timestamp, al.url, al.title, al.metadata
       FROM activity_logs al
       INNER JOIN (
         SELECT email, MAX(id) as max_id
         FROM activity_logs
         GROUP BY email
       ) latest ON al.id = latest.max_id`
    )


    // 6. Query SQLite for today's session events (STARTED and STOPPED)
    const sessionEventsToday = await querySQLite<{
      email: string
      event_type: string
      timestamp: string
      metadata: string | null
    }>(
      `SELECT email, event_type, timestamp, metadata
       FROM activity_logs
       WHERE event_type IN ('SESSION_STARTED', 'SESSION_STOPPED') AND timestamp >= ?`,
      [startOfToday]
    )

    // 7. Query SQLite for today's task events
    const taskEventsToday = await querySQLite<{
      email: string
      event_type: string
      project_id: string | null
      data_id: string | null
      timestamp: string
      metadata: string | null
    }>(
      `SELECT email, event_type, project_id, data_id, timestamp, metadata
       FROM task_events
       WHERE timestamp >= ?`,
      [startOfToday]
    )

    // 8. Query SQLite for skipped tasks over the last 7 days (to render sparkline)
    const taskEventsLast7Days = await querySQLite<{
      timestamp: string
    }>(
      `SELECT timestamp
       FROM task_events
       WHERE event_type = 'TASK_SKIPPED' AND timestamp >= ?`,
      [startOfSevenDaysAgo]
    )


    // 9. Query SQLite for hourly activity load (all time)
    const hourlyActivity = await querySQLite<{ hour: string; count: number }>(
      `SELECT SUBSTR(timestamp, 12, 2) as hour, COUNT(*) as count 
       FROM activity_logs 
       GROUP BY hour 
       ORDER BY hour ASC`
    )

    // 10. Query SQLite for all event type distribution
    const eventDistribution = await querySQLite<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) as count 
       FROM activity_logs 
       GROUP BY event_type`
    )

    const tasksSkippedToday = taskEventsToday.filter(t => t.event_type === "TASK_SKIPPED").length
    const tasksStartedToday = taskEventsToday.filter(t => t.event_type === "TASK_STARTED").length
    const skipRateToday = tasksStartedToday > 0 ? Math.round((tasksSkippedToday / tasksStartedToday) * 100) : 0



    // Unique active users today
    const activeEmailsToday = new Set<string>()
    // Check anyone who sent *any* activity logs today
    const todayLogs = await querySQLite<{ email: string }>(
      `SELECT DISTINCT email FROM activity_logs WHERE timestamp >= ?`,
      [startOfToday]
    )
    todayLogs.forEach(l => activeEmailsToday.add(l.email.toLowerCase()))

    // Calculate Team Active Time today
    let teamActiveTimeMsToday = 0
    let teamPausedTimeMsToday = 0
    let stopSessionCountToday = 0

    // Group session events by user
    const sessionEventsByUser: Record<string, typeof sessionEventsToday> = {}
    sessionEventsToday.forEach(evt => {
      const email = evt.email.toLowerCase()
      if (!sessionEventsByUser[email]) sessionEventsByUser[email] = []
      sessionEventsByUser[email].push(evt)
    })

    // For each user with session activity today:
    Object.keys(sessionEventsByUser).forEach(email => {
      const userEvts = sessionEventsByUser[email].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      let activeSessionStart: number | null = null

      userEvts.forEach(evt => {
        if (evt.event_type === "SESSION_STARTED") {
          activeSessionStart = new Date(evt.timestamp).getTime()
        } else if (evt.event_type === "SESSION_STOPPED") {
          let metadataObj: any = {}
          try {
            if (evt.metadata) metadataObj = JSON.parse(evt.metadata)
          } catch {}
          
          if (metadataObj.totalActiveTimeMs) {
            teamActiveTimeMsToday += metadataObj.totalActiveTimeMs
            teamPausedTimeMsToday += metadataObj.totalPausedTimeMs || 0
          } else if (activeSessionStart !== null) {
            teamActiveTimeMsToday += (new Date(evt.timestamp).getTime() - activeSessionStart)
          }
          activeSessionStart = null
          stopSessionCountToday++
        }
      })

      // If session is still active (started but not stopped)
      if (activeSessionStart !== null) {
        const sessionDuration = Math.max(0, Date.now() - activeSessionStart)
        // Cap session duration at 24 hours to prevent crazy timezone jumps
        teamActiveTimeMsToday += Math.min(sessionDuration, 24 * 60 * 60 * 1000)
      }
    })

    // Team average session duration today
    const avgSessionDurationMsToday = stopSessionCountToday > 0 
      ? Math.round(teamActiveTimeMsToday / stopSessionCountToday) 
      : teamActiveTimeMsToday // if only 1 active session

    // Calculate Focus Ratio today
    const focusRatioToday = (teamActiveTimeMsToday + teamPausedTimeMsToday) > 0
      ? Math.round((teamActiveTimeMsToday / (teamActiveTimeMsToday + teamPausedTimeMsToday)) * 100)
      : 85 // Fallback baseline if no logs

    // Sparkline calculation for last 7 days
    const sparklineData: number[] = new Array(7).fill(0)
    const daysLabel: string[] = []
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split("T")[0]
      daysLabel.push(d.toLocaleDateString([], { weekday: "short" }))
      
      // Filter tasks for this day
      const count = taskEventsLast7Days.filter(t => {
        return t.timestamp.startsWith(dateStr)
      }).length
      sparklineData[6 - i] = count
    }

    // Build the teamMembers list for the Team Overview tab
    const teamMembersData = employees.map(emp => {
      const stats = userStatsAllTime.find(s => s.email.toLowerCase() === emp.email.toLowerCase())
      const latest = latestEvents.find(s => s.email.toLowerCase() === emp.email.toLowerCase())

      // Filter today's session events for this user
      const userSessionEvts = sessionEventsToday
        .filter(evt => evt.email.toLowerCase() === emp.email.toLowerCase())
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      let sessionTimeTodayMs = 0
      let activeTimeTodayMs = 0
      let pauseCountToday = 0

      let sessionStart: number | null = null
      let pauseStart: number | null = null
      let accumulatedPauseTimeMs = 0

      userSessionEvts.forEach(evt => {
        if (evt.event_type === "SESSION_STARTED") {
          sessionStart = new Date(evt.timestamp).getTime()
          pauseStart = null
          accumulatedPauseTimeMs = 0
        } else if (evt.event_type === "SESSION_PAUSED") {
          pauseStart = new Date(evt.timestamp).getTime()
          pauseCountToday++
        } else if (evt.event_type === "SESSION_RESUMED") {
          if (pauseStart !== null) {
            accumulatedPauseTimeMs += (new Date(evt.timestamp).getTime() - pauseStart)
            pauseStart = null
          }
        } else if (evt.event_type === "SESSION_STOPPED") {
          let metadataObj: any = {}
          try {
            if (evt.metadata) metadataObj = JSON.parse(evt.metadata)
          } catch {}

          if (metadataObj.totalSessionTimeMs) {
            sessionTimeTodayMs += metadataObj.totalSessionTimeMs
            activeTimeTodayMs += metadataObj.totalActiveTimeMs || 0
            pauseCountToday += metadataObj.pauseCount || 0
          } else if (sessionStart !== null) {
            const stopTime = new Date(evt.timestamp).getTime()
            const totalSession = stopTime - sessionStart
            
            if (pauseStart !== null) {
              accumulatedPauseTimeMs += (stopTime - pauseStart)
            }
            
            sessionTimeTodayMs += totalSession
            activeTimeTodayMs += (totalSession - accumulatedPauseTimeMs)
          }
          sessionStart = null
          pauseStart = null
          accumulatedPauseTimeMs = 0
        }
      })

      // If session is still active (started but not stopped)
      if (sessionStart !== null) {
        const nowMs = Date.now()
        const totalSession = nowMs - sessionStart
        
        if (pauseStart !== null) {
          accumulatedPauseTimeMs += (nowMs - pauseStart)
        }
        
        sessionTimeTodayMs += totalSession
        activeTimeTodayMs += (totalSession - accumulatedPauseTimeMs)
      }

      // Today's task counts for this user
      const userTasksToday = taskEventsToday.filter(t => t.email.toLowerCase() === emp.email.toLowerCase())
      const tasksSkippedToday = userTasksToday.filter(t => t.event_type === "TASK_SKIPPED").length
      const tasksStartedToday = userTasksToday.filter(t => t.event_type === "TASK_STARTED").length


      // Focus ratio
      const focusRatioToday = sessionTimeTodayMs > 0
        ? Math.round((activeTimeTodayMs / sessionTimeTodayMs) * 100)
        : 0

      // Live status evaluation
      let isTrackingActive = false
      let currentStatus: "active" | "idle" | "offline" = "offline"
      let lastActiveText = "Never active"
      let lastEventText = ""
      let lastUrl = ""
      let lastTitle = ""

      if (stats && stats.last_active) {
        const lastActiveTime = new Date(stats.last_active).getTime()
        const diffMs = Date.now() - lastActiveTime
        const isRecent = diffMs < 10 * 60 * 1000 // 10 minutes limit

        // Parse latest event metadata
        let metadataObj: any = {}
        if (latest && latest.metadata) {
          try {
            metadataObj = JSON.parse(latest.metadata)
          } catch {}
        }

        if (latest?.event_type === "SESSION_STOPPED") {
          currentStatus = "offline"
        } else if (latest?.event_type === "IDLE_STATE_CHANGED" && (metadataObj?.state === "idle" || metadataObj?.state === "locked")) {
          currentStatus = "idle"
        } else if (isRecent) {
          currentStatus = "active"
        } else if (diffMs < 30 * 60 * 1000) {
          currentStatus = "idle" // Idle if inactive for 10-30 minutes
        } else {
          currentStatus = "offline"
        }

        isTrackingActive = (currentStatus === "active" || currentStatus === "idle")
        lastActiveText = stats.last_active
        lastEventText = latest ? latest.event_type : ""
        lastUrl = latest?.url || ""
        lastTitle = latest?.title || ""
      }

      return {
        email: emp.email,
        name: emp.name,
        role: emp.role,
        eventCount: stats ? stats.event_count : 0,
        screenshotCount: 0,
        lastActive: stats ? stats.last_active : null,
        isTrackingActive,
        currentStatus,
        lastActiveText,
        lastEventText,
        lastUrl,
        lastTitle,
        sessionTimeTodayMs,
        activeTimeTodayMs,
        pauseCountToday,
        tasksSkippedToday,
        tasksStartedToday,
        focusRatioToday
      }
    })


    // Generate alerts
    const alertsList: Array<{ id: string; type: "info" | "warning" | "critical"; title: string; description: string; time: string }> = []
    
    // Alert 1: Unregistered / absent users
    const inactiveEmpNames: string[] = []
    employees.forEach(emp => {
      if (emp.role === "employee" && !activeEmailsToday.has(emp.email.toLowerCase())) {
        inactiveEmpNames.push(emp.name)
      }
    })
    if (inactiveEmpNames.length > 0) {
      alertsList.push({
        id: "absent_users",
        type: "warning",
        title: "Absent Annotators",
        description: `${inactiveEmpNames.length} team member(s) haven't logged any session today: ${inactiveEmpNames.join(", ")}`,
        time: "Today"
      })
    }

    // Alert 2: High skip rate
    teamMembersData.forEach(member => {
      const userTasksToday = taskEventsToday.filter(t => t.email.toLowerCase() === member.email.toLowerCase())
      const started = userTasksToday.filter(t => t.event_type === "TASK_STARTED").length
      const skipped = userTasksToday.filter(t => t.event_type === "TASK_SKIPPED").length
      if (started >= 3) {
        const rate = Math.round((skipped / started) * 100)
        if (rate >= 40) {
          alertsList.push({
            id: `high_skip_${member.email}`,
            type: "critical",
            title: "High Skip Rate Alert",
            description: `${member.name} skipped ${skipped} out of ${started} started tasks today (${rate}% skip rate).`,
            time: "Active Session"
          })
        }
      }
    })


    // Alert 3: Session running too long (>8 hours)
    teamMembersData.forEach(member => {
      if (member.isTrackingActive) {
        const userSessionEvts = sessionEventsByUser[member.email.toLowerCase()] || []
        const lastStart = userSessionEvts.filter(e => e.event_type === "SESSION_STARTED").pop()
        if (lastStart) {
          const elapsedHours = (Date.now() - new Date(lastStart.timestamp).getTime()) / (1000 * 60 * 60)
          if (elapsedHours > 8) {
            alertsList.push({
              id: `long_session_${member.email}`,
              type: "info",
              title: "Overtime Session",
              description: `${member.name} has been active for ${Math.round(elapsedHours)} hours without logoff.`,
              time: "Continuous"
            })
          }
        }
      }
    })

    return NextResponse.json({
      teamMembers: teamMembersData,
      eventDistribution,
      hourlyActivity,
      kpis: {
        totalAnnotatorsToday: activeEmailsToday.size,
        teamActiveTimeTodayMs: teamActiveTimeMsToday,
        tasksStartedToday,
        tasksSkippedToday,
        skipRateToday,
        focusRatioToday,
        avgSessionDurationTodayMs: avgSessionDurationMsToday
      },
      sparkline: {
        data: sparklineData,
        labels: daysLabel
      },
      alerts: alertsList
    })
  } catch (err: any) {
    console.error("Overview API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
