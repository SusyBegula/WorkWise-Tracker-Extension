const BACKEND_URL = "http://localhost:3000/api/activity"
const SCREENSHOT_ALARM_NAME = "workwise-screenshot-alarm"
const SCREENSHOT_INTERVAL_MINUTES = 1.0 // 1.0 minutes for testing; user can set to 15.0

// Raw helper to send events to the backend logger without state checking
async function logActivityRaw(
  eventType: string,
  url: string | null = null,
  title: string | null = null,
  metadata: any = {}
) {
  const payload = {
    eventType,
    url,
    title,
    timestamp: new Date().toISOString(),
    metadata
  }

  console.log(`[Activity Tracker] Sending ${eventType}:`, {
    ...payload,
    metadata: {
      ...metadata,
      image: metadata.image ? "[Base64 Image Data]" : undefined
    }
  })

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      console.warn(`[Activity Tracker] Failed to send log. Server responded with status: ${response.status}`)
    }
  } catch (error) {
    console.error("[Activity Tracker] Network error connecting to backend logger:", error)
  }
}

// State-aware helper to send events to the backend logger
async function logActivity(
  eventType: string,
  url: string | null = null,
  title: string | null = null,
  metadata: any = {}
) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const result = await chrome.storage.local.get(["sessionStatus", "eventCount"])
    
    // Only capture events if the session is ACTIVE
    if (result.sessionStatus !== "active") {
      console.log(`[Activity Tracker] Discarding ${eventType} because status is ${result.sessionStatus || "inactive"}`)
      return
    }

    // Increment event count
    const currentCount = result.eventCount || 0
    const newCount = currentCount + 1
    await chrome.storage.local.set({ eventCount: newCount })
    
    // Send event
    await logActivityRaw(eventType, url, title, metadata)
  }
}

// Helper to capture active tab screen visual data and send to backend
async function captureAndSendScreenshot() {
  console.log("[Activity Tracker] captureAndSendScreenshot triggered")
  const data = await chrome.storage.local.get("sessionStatus")
  if (data.sessionStatus !== "active") {
    console.log("[Activity Tracker] Screenshot capture skipped: Session is not active.")
    return
  }

  console.log("[Activity Tracker] Finding active normal window...")
  chrome.windows.getAll({ populate: false }, (windows) => {
    if (chrome.runtime.lastError || !windows || windows.length === 0) {
      console.warn("[Activity Tracker] Failed to query windows:", chrome.runtime.lastError)
      return
    }

    // Find the focused normal window, or fallback to the first normal window
    const normalWindow = windows.find(w => w.type === "normal" && w.focused) || windows.find(w => w.type === "normal")
    if (!normalWindow || !normalWindow.id) {
      console.warn("[Activity Tracker] No normal browser window found to capture.")
      return
    }

    console.log(`[Activity Tracker] Capturing visible tab in window ${normalWindow.id}...`)
    chrome.tabs.query({ active: true, windowId: normalWindow.id }, (tabs) => {
      let tabTitle = "unknown"
      let tabUrl = null
      
      if (!chrome.runtime.lastError && tabs && tabs.length > 0) {
        tabTitle = tabs[0].title || "unknown"
        tabUrl = tabs[0].url || null
      }

      chrome.tabs.captureVisibleTab(
        normalWindow.id,
        { format: "jpeg", quality: 40 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.warn("[Activity Tracker] Screenshot capture failed:", chrome.runtime.lastError.message)
            return
          }
          if (dataUrl) {
            console.log("[Activity Tracker] Screenshot captured successfully. Sending to backend...")
            logActivityRaw("SCREENSHOT_CAPTURED", tabUrl, tabTitle, { image: dataUrl })
          }
        }
      )
    })
  })
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
        eventCount
      })

      // Clear any existing alarms to reset state, then schedule a new periodic alarm
      chrome.alarms.clear(SCREENSHOT_ALARM_NAME, () => {
        chrome.alarms.create(SCREENSHOT_ALARM_NAME, { periodInMinutes: SCREENSHOT_INTERVAL_MINUTES })
        console.log(`[Activity Tracker] Scheduled screenshot alarm: ${SCREENSHOT_ALARM_NAME} every ${SCREENSHOT_INTERVAL_MINUTES} min.`)
      })

      // Capture a screenshot immediately on session start (after 2 seconds delay)
      setTimeout(captureAndSendScreenshot, 2000)

      // Send start event to backend
      await logActivityRaw("SESSION_STARTED", null, null, {})
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

      // Clear any existing alarms to reset state, then schedule a new periodic alarm
      chrome.alarms.clear(SCREENSHOT_ALARM_NAME, () => {
        chrome.alarms.create(SCREENSHOT_ALARM_NAME, { periodInMinutes: SCREENSHOT_INTERVAL_MINUTES })
        console.log(`[Activity Tracker] Rescheduled screenshot alarm: ${SCREENSHOT_ALARM_NAME} every ${SCREENSHOT_INTERVAL_MINUTES} min.`)
      })

      // Capture a screenshot immediately on resume (after 2 seconds delay)
      setTimeout(captureAndSendScreenshot, 2000)

      await logActivityRaw("SESSION_RESUMED", null, null, {
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

      // Disable screenshot alarms
      chrome.alarms.clear(SCREENSHOT_ALARM_NAME)

      await logActivityRaw("SESSION_PAUSED", null, null, {
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

    // Disable screenshot alarms
    chrome.alarms.clear(SCREENSHOT_ALARM_NAME)

    // Reset storage status
    await chrome.storage.local.set({
      sessionStatus: "inactive",
      sessionStartTime: 0,
      lastStateTransitionTime: 0,
      accumulatedActiveTime: 0,
      accumulatedPauseTime: 0,
      pauseCount: 0,
      pauseHistory: [],
      eventCount: 0
    })

    // Send summary stop event to backend
    await logActivityRaw("SESSION_STOPPED", null, null, {
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

// Listen for screenshot alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`[Activity Tracker] Alarm event received: ${alarm.name}`)
  if (alarm.name === SCREENSHOT_ALARM_NAME) {
    captureAndSendScreenshot()
  }
})

// Listen for messages from content scripts or popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PAGE_EVENT") {
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
    eventCount: 0
  })
})

export {}
