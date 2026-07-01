const API_BASE = process.env.PLASMO_PUBLIC_API_BASE || "http://localhost:3000"
const BACKEND_URL = `${API_BASE}/api/activity`

// Event Buffering Settings
const FLUSH_ALARM_NAME = "workwise-flush-alarm"
const FLUSH_INTERVAL_MINUTES = 0.5 // Flush fallback every 30 seconds

let flushIntervalId: NodeJS.Timeout | null = null

function startFlushTimer() {
  if (flushIntervalId) {
    clearInterval(flushIntervalId)
  }
  flushIntervalId = setInterval(() => {
    flushBufferedEvents()
  }, 1000)
  console.log("[Activity Tracker] 1-second flush interval timer started.")
}

function stopFlushTimer() {
  if (flushIntervalId) {
    clearInterval(flushIntervalId)
    flushIntervalId = null
    console.log("[Activity Tracker] 1-second flush interval timer stopped.")
  }
}

// Re-register alarms on startup/service worker wakeup if the session was active
async function restoreSessionAlarms() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return

  const data = await chrome.storage.local.get(["sessionStatus"])
  if (data.sessionStatus === "active") {
    console.log("[Activity Tracker] Active session detected on startup. Restoring alarms and timers...")
    
    chrome.alarms.get(FLUSH_ALARM_NAME, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
        console.log(`[Activity Tracker] Re-registered missing flush alarm after startup.`)
      }
    })

    startFlushTimer()
  }
}


// Run restoration routine on service worker initialization
restoreSessionAlarms()

// Flushes all buffered events stored in chrome.storage.local
async function flushBufferedEvents() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return

  const data = await chrome.storage.local.get(["bufferedEvents"])
  const events = data.bufferedEvents || []
  if (events.length === 0) return

  // Clear buffer in storage first to prevent duplicate sends
  await chrome.storage.local.set({ bufferedEvents: [] })
  console.log(`[Activity Tracker] Flushing ${events.length} buffered events...`)

  try {
    let token = ""
    const authData = await chrome.storage.local.get("token")
    token = authData.token || ""

    const headers: any = {
      "Content-Type": "application/json"
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(events)
    })

    if (!response.ok) {
      console.warn(`[Activity Tracker] Failed to send event batch. Server responded with status: ${response.status}`)
      
      // Auto logout/stop session if token becomes invalid (unauthorized)
      if (response.status === 401 || response.status === 403) {
        console.warn(`[Activity Tracker] Auth failed (${response.status}). Force-stopping active session.`)
        await transitionSessionState("inactive")
      } else {
        // Put events back in buffer on server error
        const curData = await chrome.storage.local.get("bufferedEvents")
        const curEvents = curData.bufferedEvents || []
        await chrome.storage.local.set({ bufferedEvents: [...events, ...curEvents] })
      }
    }
  } catch (error) {
    console.error("[Activity Tracker] Network error connecting to backend logger, re-buffering events:", error)
    // Put events back in buffer on network error
    const curData = await chrome.storage.local.get("bufferedEvents")
    const curEvents = curData.bufferedEvents || []
    await chrome.storage.local.set({ bufferedEvents: [...events, ...curEvents] })
  }
}

// Send a single event immediately along with any existing buffered events
async function logActivityImmediate(
  eventType: string,
  url: string | null = null,
  title: string | null = null,
  metadata: any = {}
) {
  const newEvent = {
    eventType,
    url,
    title,
    timestamp: new Date().toISOString(),
    metadata
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get("bufferedEvents")
    const currentBuffer = data.bufferedEvents || []
    await chrome.storage.local.set({ bufferedEvents: [...currentBuffer, newEvent] })
    await flushBufferedEvents()
  }
}

// State-aware helper to buffer standard events
async function logActivity(
  eventType: string,
  url: string | null = null,
  title: string | null = null,
  metadata: any = {}
) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get(["sessionStatus", "eventCount", "bufferedEvents"])
    
    // Only capture events if the session is ACTIVE
    if (result.sessionStatus !== "active") {
      console.log(`[Activity Tracker] Discarding ${eventType} because status is ${result.sessionStatus || "inactive"}`)
      return
    }

    // Increment event count
    const currentCount = result.eventCount || 0
    const newCount = currentCount + 1
    
    const newEvent = {
      eventType,
      url,
      title,
      timestamp: new Date().toISOString(),
      metadata
    }

    const currentBuffer = result.bufferedEvents || []
    const newBuffer = [...currentBuffer, newEvent]
    
    await chrome.storage.local.set({ 
      eventCount: newCount,
      bufferedEvents: newBuffer
    })

    // TESTING: flush after every event so logs appear on the dashboard almost
    // immediately (no 30s batching wait). For production, raise this back to ~30
    // to batch and cut request volume.
    const FLUSH_AFTER = 1
    if (newBuffer.length >= FLUSH_AFTER) {
      await flushBufferedEvents()
    }
  }
}

const BLOCKED_DOMAINS = ["whatsapp.com", "instagram.com"]
function isBlockedUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const parsedUrl = new URL(url)
    const host = parsedUrl.hostname.toLowerCase()
    return BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith("." + domain))
  } catch (e) {
    const lowerUrl = url.toLowerCase()
    return BLOCKED_DOMAINS.some(domain => lowerUrl.includes(domain))
  }
}


// State machine transition helper
async function transitionSessionState(nextStatus: "inactive" | "active" | "paused") {
  const now = Date.now()
  const data = await chrome.storage.local.get([
    "sessionStatus",
    "sessionStartTime",
    "lastStateTransitionTime",
    "accumulatedActiveTime",
    "accumulatedPauseTime",
    "pauseCount",
    "pauseHistory",
    "eventCount"
  ])

  const currentStatus = data.sessionStatus || "inactive"
  if (currentStatus === nextStatus) return

  let sessionStartTime = data.sessionStartTime || 0
  let lastStateTransitionTime = data.lastStateTransitionTime || 0
  let accumulatedActiveTime = data.accumulatedActiveTime || 0
  let accumulatedPauseTime = data.accumulatedPauseTime || 0
  let pauseCount = data.pauseCount || 0
  let pauseHistory = data.pauseHistory || []
  let eventCount = data.eventCount || 0

  if (nextStatus === "active") {
    if (currentStatus === "inactive") {
      // Start a brand new session
      sessionStartTime = now
      lastStateTransitionTime = now
      accumulatedActiveTime = 0
      accumulatedPauseTime = 0
      pauseCount = 0
      pauseHistory = []
      eventCount = 0

      await chrome.storage.local.set({
        sessionStatus: "active",
        sessionStartTime,
        lastStateTransitionTime: now,
        accumulatedActiveTime,
        accumulatedPauseTime,
        pauseCount,
        pauseHistory,
        eventCount,
        bufferedEvents: []
      })

      // Setup periodic flush alarm
      chrome.alarms.clear(FLUSH_ALARM_NAME, () => {
        chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
        console.log(`[Activity Tracker] Scheduled flush alarm: ${FLUSH_ALARM_NAME} every ${FLUSH_INTERVAL_MINUTES} min.`)
      })

      startFlushTimer()

      // Send start event to backend immediately
      await logActivityImmediate("SESSION_STARTED", null, null, {})
    } else if (currentStatus === "paused") {
      // Resume from paused
      const pauseDuration = now - lastStateTransitionTime
      accumulatedPauseTime += pauseDuration
      
      pauseHistory.push({
        pausedAt: lastStateTransitionTime,
        resumedAt: now,
        durationMs: pauseDuration
      })

      await chrome.storage.local.set({
        sessionStatus: "active",
        lastStateTransitionTime: now,
        accumulatedPauseTime,
        pauseHistory
      })

      chrome.alarms.clear(FLUSH_ALARM_NAME, () => {
        chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
        console.log(`[Activity Tracker] Rescheduled flush alarm: ${FLUSH_ALARM_NAME} every ${FLUSH_INTERVAL_MINUTES} min.`)
      })

      startFlushTimer()

      await logActivityImmediate("SESSION_RESUMED", null, null, {
        pauseDurationMs: pauseDuration
      })
    }
  } else if (nextStatus === "paused") {
    if (currentStatus === "active") {
      // Pause active session
      const activeDuration = now - lastStateTransitionTime
      accumulatedActiveTime += activeDuration

      await chrome.storage.local.set({
        sessionStatus: "paused",
        lastStateTransitionTime: now,
        accumulatedActiveTime,
        pauseCount: pauseCount + 1
      })

      // Disable flush alarms
      chrome.alarms.clear(FLUSH_ALARM_NAME)

      stopFlushTimer()

      // Send pause event immediately (and flush any pending interaction logs)
      await logActivityImmediate("SESSION_PAUSED", null, null, {
        activeDurationMs: activeDuration
      })
    }
  } else if (nextStatus === "inactive") {
    // Stop the session
    let finalActiveTime = accumulatedActiveTime
    let finalPauseTime = accumulatedPauseTime

    if (currentStatus === "active") {
      finalActiveTime += (now - lastStateTransitionTime)
    } else if (currentStatus === "paused") {
      const lastPauseDuration = now - lastStateTransitionTime
      finalPauseTime += lastPauseDuration
      pauseHistory.push({
        pausedAt: lastStateTransitionTime,
        resumedAt: now,
        durationMs: lastPauseDuration
      })
    }

    const totalSessionTime = now - sessionStartTime

    // Disable flush alarms
    chrome.alarms.clear(FLUSH_ALARM_NAME)

    stopFlushTimer()

    // Flush any remaining active logs before resetting storage
    await flushBufferedEvents()

    // Reset storage status
    await chrome.storage.local.set({
      sessionStatus: "inactive",
      sessionStartTime: 0,
      lastStateTransitionTime: 0,
      accumulatedActiveTime: 0,
      accumulatedPauseTime: 0,
      pauseCount: 0,
      pauseHistory: [],
      eventCount: 0,
      bufferedEvents: [],
      encordEmail: null
    })

    // Send summary stop event immediately
    await logActivityImmediate("SESSION_STOPPED", null, null, {
      totalSessionTimeMs: totalSessionTime,
      totalActiveTimeMs: finalActiveTime,
      totalPausedTimeMs: finalPauseTime,
      pauseCount,
      pauseHistory,
      totalEvents: eventCount
    })
  }

}

// Helper to safely get tab details
async function getTabDetails(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId)
  } catch (error) {
    return null
  }
}

// Track when tabs are activated (switched)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await getTabDetails(activeInfo.tabId)
  if (tab) {
    await logActivity("TAB_ACTIVATED", tab.url, tab.title, { tabId: activeInfo.tabId })
  }
})

// Track when tabs are updated (navigation, title changes, loading complete)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    await logActivity("TAB_UPDATED", tab.url, tab.title, {
      tabId,
      status: changeInfo.status || "loaded",
      urlChanged: !!changeInfo.url
    })
  }
})

// Track when tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await logActivity("TAB_CLOSED", null, null, {
    tabId,
    isWindowClosing: removeInfo.isWindowClosing
  })
})

// Track when the active window changes (losing focus, switching windows)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await logActivity("WINDOW_UNFOCUSED", null, null, {
      message: "Browser lost focus (user switched to another application)"
    })
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: windowId })
      if (tabs && tabs.length > 0) {
        const activeTab = tabs[0]
        await logActivity("WINDOW_FOCUSED", activeTab.url, activeTab.title, {
          windowId,
          tabId: activeTab.id
        })
      } else {
        await logActivity("WINDOW_FOCUSED", null, null, { windowId })
      }
    } catch (error) {
      await logActivity("WINDOW_FOCUSED", null, null, { windowId, error: String(error) })
    }
  }
})

// Track user idle status (active, idle, locked)
chrome.idle.onStateChanged.addListener(async (newState) => {
  await logActivity("IDLE_STATE_CHANGED", null, null, {
    state: newState,
    message: `User is now ${newState}`
  })
})

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`[Activity Tracker] Alarm event received: ${alarm.name}`)
  if (alarm.name === FLUSH_ALARM_NAME) {
    flushBufferedEvents()
  }
})


// Listen for messages from content scripts or popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PAGE_EVENT") {
    if (message.eventType === "ENCORD_EMAIL_CAPTURED" && message.metadata && message.metadata.email) {
      chrome.storage.local.set({ encordEmail: message.metadata.email })
    }
    logActivity(message.eventType, message.url, message.title, message.metadata)
  } else if (message.type === "TRANSITION_STATE") {
    transitionSessionState(message.nextStatus).then(() => {
      sendResponse({ success: true })
    })
    return true // Keep channel open for async response
  }
})

// Initialize storage values on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    sessionStatus: "inactive",
    sessionStartTime: 0,
    lastStateTransitionTime: 0,
    accumulatedActiveTime: 0,
    accumulatedPauseTime: 0,
    pauseCount: 0,
    pauseHistory: [],
    eventCount: 0,
    bufferedEvents: [],
    encordEmail: null
  })
})

export {}
