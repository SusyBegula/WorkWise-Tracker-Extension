import { useEffect, useState } from "react"
import "./popup.css"

const API_BASE = process.env.PLASMO_PUBLIC_API_BASE || "http://localhost:3000"

function IndexPopup() {
  const [status, setStatus] = useState<"inactive" | "active" | "paused">("inactive")
  const [sessionStartTime, setSessionStartTime] = useState(0)
  const [lastStateTransitionTime, setLastStateTransitionTime] = useState(0)
  const [accumulatedActiveTime, setAccumulatedActiveTime] = useState(0)
  const [accumulatedPauseTime, setAccumulatedPauseTime] = useState(0)
  const [pauseCount, setPauseCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [ticker, setTicker] = useState(0)

  // Auth States
  const [token, setToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [passwordInput, setPasswordInput] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
          "eventCount",
          "token",
          "userEmail",
          "userName"
        ],
        (data) => {
          setStatus(data.sessionStatus || "inactive")
          setSessionStartTime(data.sessionStartTime || 0)
          setLastStateTransitionTime(data.lastStateTransitionTime || 0)
          setAccumulatedActiveTime(data.accumulatedActiveTime || 0)
          setAccumulatedPauseTime(data.accumulatedPauseTime || 0)
          setPauseCount(data.pauseCount || 0)
          setEventCount(data.eventCount || 0)
          setToken(data.token || null)
          setUserEmail(data.userEmail || null)
          setUserName(data.userName || null)
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: emailInput,
          password: passwordInput
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setLoginError(data.error || "Login failed")
      } else {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({
            token: data.token,
            userEmail: data.email,
            userName: data.name
          })
          setToken(data.token)
          setUserEmail(data.email)
          setUserName(data.name)
        }
      }
    } catch (err) {
      setLoginError("Cannot connect to server. Is the backend running?")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    // If a session is active, stop it first
    if (status !== "inactive") {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({ type: "TRANSITION_STATE", nextStatus: "inactive" })
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(["token", "userEmail", "userName"])
      setToken(null)
      setUserEmail(null)
      setUserName(null)
      setEmailInput("")
      setPasswordInput("")
      setLoginError(null)
    }
  }

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

  // If not logged in, render the Login Screen
  if (!token) {
    return (
      <div className="popup-container">
        <div className="header-container" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="header" style={{ width: "100%", alignItems: "center", textAlign: "center" }}>
            <div className="logo-area" style={{ justifyContent: "center" }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="logo-icon inactive">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h1 className="title">WorkWise</h1>
            </div>
            <p className="subtitle">Activity Tracker</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="login-card">
          <div className="login-header">
            <h2 className="login-title">Employee Portal</h2>
            <p className="login-subtitle">Sign in using whitelisted work email</p>
          </div>

          <div className="form-group">
            <label className="form-label">Work Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="employee@workwise.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          {loginError && <div className="error-message">{loginError}</div>}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 14, height: 14 }}>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>Log In</span>
              </>
            )}
          </button>
        </form>

        <div className="footer" style={{ marginTop: "12px" }}>WorkWise Tracker v0.0.1</div>
      </div>
    )
  }

  // If logged in, render the main Tracker Screen
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
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {userEmail && (
            <div className="profile-section">
              <span className="user-email-display" title={userEmail}>
                {userName || userEmail.split("@")[0]}
              </span>
              <button onClick={handleLogout} className="logout-btn" title="Log Out">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 10, height: 10 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
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
