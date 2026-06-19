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

    const targetEmail = email.toLowerCase().trim()

    // Get date bounds for today
    const now = new Date()
    const todayLocal = new Date(now)
    todayLocal.setHours(0, 0, 0, 0)
    const startOfToday = todayLocal.toISOString()

    // 1. Fetch chronological granular activity logs (last 300)
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
      [targetEmail]
    )

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

    // 2. Fetch event stats breakdown (all-time)
    const statsResult = await querySQLite<{ event_type: string; count: number }>(
      `SELECT event_type, COUNT(*) as count 
       FROM activity_logs 
       WHERE email = ? 
       GROUP BY event_type`,
      [targetEmail]
    )

    // 3. Fetch task events (last 50)
    const taskEvents = await querySQLite<{
      id: number
      event_type: string
      project_id: string | null
      data_id: string | null
      url: string | null
      title: string | null
      timestamp: string
      metadata: string | null
    }>(
      `SELECT id, event_type, project_id, data_id, url, title, timestamp, metadata
       FROM task_events
       WHERE email = ?
       ORDER BY timestamp DESC
       LIMIT 50`,
      [targetEmail]
    )

    const parsedTaskEvents = taskEvents.map(t => {
      let metaObj = null
      if (t.metadata) {
        try {
          metaObj = JSON.parse(t.metadata)
        } catch {}
      }
      return {
        ...t,
        metadata: metaObj
      }
    })

    // 4. Fetch screenshots (last 12)
    const screenshots = await querySQLite<{
      id: number
      email: string
      url: string
      title: string
      timestamp: string
    }>(
      `SELECT id, email, url, title, timestamp 
       FROM screenshots 
       WHERE email = ? 
       ORDER BY timestamp DESC 
       LIMIT 12`,
      [targetEmail]
    )

    const mappedScreenshots = screenshots.map(s => ({
      id: s.id,
      email: s.email,
      url: s.url,
      title: s.title,
      timestamp: s.timestamp,
      imageUrl: `/api/telemetry/screenshots/image?id=${s.id}`
    }))

    // 5. Fetch raw daily logs to calculate URL domains and Encord section times
    const todayLogs = await querySQLite<{
      event_type: string
      url: string | null
      title: string | null
      timestamp: string
      metadata: string | null
    }>(
      `SELECT event_type, url, title, timestamp, metadata
       FROM activity_logs
       WHERE email = ? AND timestamp >= ?
       ORDER BY timestamp ASC`,
      [targetEmail, startOfToday]
    )

    const domainTime: Record<string, number> = {}
    const encordCategoryTime: Record<string, number> = {
      home: 0,
      projects: 0,
      project_view: 0,
      label_editor: 0,
      other: 0
    }

    let lastTime = 0
    let lastUrl: string | null = null
    let lastEncordCategory: string | null = null
    let isPaused = false
    let isOffline = true

    todayLogs.forEach(log => {
      const logTime = new Date(log.timestamp).getTime()

      if (lastTime > 0 && !isPaused && !isOffline) {
        const elapsed = Math.max(0, logTime - lastTime)
        
        if (lastUrl) {
          try {
            const domain = new URL(lastUrl).hostname.replace("www.", "")
            domainTime[domain] = (domainTime[domain] || 0) + elapsed
          } catch {
            domainTime["other"] = (domainTime["other"] || 0) + elapsed
          }
        }

        if (lastEncordCategory) {
          encordCategoryTime[lastEncordCategory] = (encordCategoryTime[lastEncordCategory] || 0) + elapsed
        }
      }

      lastTime = logTime

      if (log.event_type === "SESSION_STARTED") {
        isOffline = false
        isPaused = false
      } else if (log.event_type === "SESSION_STOPPED") {
        isOffline = true
      } else if (log.event_type === "SESSION_PAUSED") {
        isPaused = true
      } else if (log.event_type === "SESSION_RESUMED") {
        isPaused = false
      }

      if (log.url) {
        lastUrl = log.url
        if (log.url.includes("app.encord.com")) {
          let meta: any = null
          try {
            if (log.metadata) meta = JSON.parse(log.metadata)
          } catch {}
          
          if (log.event_type === "ENCORD_PAGE_VIEW" && meta?.category) {
            lastEncordCategory = meta.category
          } else {
            const path = new URL(log.url).pathname
            if (path.startsWith("/label_editor/")) lastEncordCategory = "label_editor"
            else if (path.startsWith("/projects/view")) lastEncordCategory = "project_view"
            else if (path.startsWith("/projects/")) lastEncordCategory = "projects"
            else if (path === "/" || path === "") lastEncordCategory = "home"
            else lastEncordCategory = "other"
          }
        } else {
          lastEncordCategory = null
        }
      }
    })

    // Add final chunk if session is still active
    if (lastTime > 0 && !isPaused && !isOffline) {
      const elapsed = Math.max(0, Date.now() - lastTime)
      if (lastUrl) {
        try {
          const domain = new URL(lastUrl).hostname.replace("www.", "")
          domainTime[domain] = (domainTime[domain] || 0) + elapsed
        } catch {
          domainTime["other"] = (domainTime["other"] || 0) + elapsed
        }
      }
      if (lastEncordCategory) {
        encordCategoryTime[lastEncordCategory] = (encordCategoryTime[lastEncordCategory] || 0) + elapsed
      }
    }

    // 6. Fetch timeline events for visual bar
    const todayTimelineEvents = await querySQLite<{
      event_type: string
      timestamp: string
      metadata: string | null
    }>(
      `SELECT event_type, timestamp, metadata
       FROM activity_logs
       WHERE email = ? AND timestamp >= ? AND event_type IN ('SESSION_STARTED', 'SESSION_STOPPED', 'SESSION_PAUSED', 'SESSION_RESUMED', 'IDLE_STATE_CHANGED')
       ORDER BY timestamp ASC`,
      [targetEmail, startOfToday]
    )

    const parsedTimelineEvents = todayTimelineEvents.map(evt => {
      let meta = null
      if (evt.metadata) {
        try {
          meta = JSON.parse(evt.metadata)
        } catch {}
      }
      return {
        ...evt,
        metadata: meta
      }
    })

    return NextResponse.json({
      logs: parsedLogs,
      stats: statsResult,
      taskEvents: parsedTaskEvents,
      screenshots: mappedScreenshots,
      domainTime,
      encordCategoryTime,
      todayTimelineEvents: parsedTimelineEvents
    })
  } catch (err: any) {
    console.error("Timeline API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
