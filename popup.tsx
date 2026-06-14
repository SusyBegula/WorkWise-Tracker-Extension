import { useEffect, useState } from "react"
import "./popup.css"

function IndexPopup() {
  const [status, setStatus] = useState<"inactive" | "active" | "paused">("inactive")
  const [sessionStartTime, setSessionStartTime] = useState(0)
  const [lastStateTransitionTime, setLastStateTransitionTime] = useState(0)
  const [accumulatedActiveTime, setAccumulatedActiveTime] = useState(0)
  const [accumulatedPauseTime, setAccumulatedPauseTime] = useState(0)
  const [pauseCount, setPauseCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [ticker, setTicker] = useState(0)

  const refreshState = () => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          "sessionStatus",
          "sessionStartTime",
          "lastStateTransitionTime",
          "accumulatedActiveTime",
          "accumulatedPauseTime",
          "pauseCount",
          "eventCount"
        ],
        (data) => {
          setStatus(data.sessionStatus || "inactive")
          setSessionStartTime(data.sessionStartTime || 0)
          setLastStateTransitionTime(data.lastStateTransitionTime || 0)
          setAccumulatedActiveTime(data.accumulatedActiveTime || 0)
          setAccumulatedPauseTime(data.accumulatedPauseTime || 0)
          setPauseCount(data.pauseCount || 0)
          setEventCount(data.eventCount || 0)
        }
      )
    }
  }

  useEffect(() => {
    refreshState()

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
      if (namespace === "local") {
        refreshState()
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.onChanged.addListener(listener)
      return () => {
        chrome.storage.onChanged.removeListener(listener)
      }
    }
  }, [])

  useEffect(() => {
    if (status === "inactive") return

    const timer = setInterval(() => {
      setTicker((t) => t + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [status])

  const togglePower = () => {
    const nextStatus = status === "inactive" ? "active" : "inactive"
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "TRANSITION_STATE", nextStatus }, (response) => {
        refreshState()
      })
    }
  }

  const togglePause = () => {
    if (status === "inactive") return
    const nextStatus = status === "active" ? "paused" : "active"
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "TRANSITION_STATE", nextStatus }, (response) => {
        refreshState()
      })
    }
  }

  const formatDuration = (ms: number): string => {
    if (ms <= 0 || isNaN(ms)) return "00:00:00"
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const pad = (num: number) => String(num).padStart(2, "0")
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }

  const now = Date.now()
  let activeTimeMs = accumulatedActiveTime
  let pausedTimeMs = accumulatedPauseTime
  let totalSessionTimeMs = 0

  if (status === "active") {
    activeTimeMs += now - lastStateTransitionTime
    totalSessionTimeMs = now - sessionStartTime
  } else if (status === "paused") {
    pausedTimeMs += now - lastStateTransitionTime
    totalSessionTimeMs = now - sessionStartTime
  } else if (status === "inactive") {
    activeTimeMs = 0
    pausedTimeMs = 0
    totalSessionTimeMs = 0
  }

  return (
    <div className="popup-container">
      <div className="header-container">
        <div className="header">
          <div className="logo-area">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`logo-icon ${status}`}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <h1 className="title">WorkWise</h1>
          </div>
          <p className="subtitle">Activity Tracker</p>
        </div>
        <button
          onClick={togglePower}
          className={`power-btn ${status !== "inactive" ? "active" : ""}`}
          title={status === "inactive" ? "Start Session" : "Stop Session"}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 18, height: 18 }}>
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </button>
      </div>

      <div className={`status-card ${status}`}>
        <div className="status-info">
          <span className="status-label">TRACKING STATUS</span>
          <div className="status-value">
            <span className={`pulse-dot ${status}`}></span>
            <span style={{ textTransform: "uppercase" }}>{status}</span>
          </div>
        </div>
        {status !== "inactive" && (
          <button
            onClick={togglePause}
            className={`pause-btn ${status === "paused" ? "active" : ""}`}>
            {status === "paused" ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: 10, height: 10 }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Resume</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: 10, height: 10 }}>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>Pause</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="timer-card">
        <span className="timer-label">SESSION TIME</span>
        <div className={`timer-display ${status === "inactive" ? "inactive" : ""}`}>
          {formatDuration(totalSessionTimeMs)}
        </div>
      </div>

      <div className="stats-container">
        <div className="stat-item">
          <span className="stat-name">Active Time</span>
          <span className="stat-value">{formatDuration(activeTimeMs)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-name">Paused Time</span>
          <span className="stat-value">{formatDuration(pausedTimeMs)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-name">Events Tracked</span>
          <span className="stat-value">{eventCount}</span>
        </div>
        <div className="stat-item">
          <span className="stat-name">Pause Count</span>
          <span className="stat-value">{pauseCount}</span>
        </div>
      </div>

      <div className="footer">WorkWise Tracker v0.0.1</div>
    </div>
  )
}

export default IndexPopup
