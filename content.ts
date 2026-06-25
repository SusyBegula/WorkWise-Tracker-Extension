import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_end"
}

console.log("[WorkWise Tracker] Content script loaded and listening for user interactions.")

// Privacy Exclusion List
const BLOCKED_DOMAINS = ["whatsapp.com", "instagram.com"]
function isBlockedUrl(): boolean {
  const host = window.location.hostname.toLowerCase()
  return BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith("." + domain))
}

// Keystroke CONTENT is only captured on these work domains (privacy allowlist).
// Everywhere else, typed characters are never recorded. The backend enforces
// the same rule as defense-in-depth.
const WORK_DOMAINS = ["encord.com"]
function isWorkDomain(): boolean {
  const host = window.location.hostname.toLowerCase()
  return WORK_DOMAINS.some(domain => host === domain || host.endsWith("." + domain))
}

// ─────────────────────────────────────────────────────────────
// ENCORD CONTEXT HELPERS
// ─────────────────────────────────────────────────────────────

const isEncordDomain = window.location.hostname.includes("app.encord.com")

/** Returns the category of the current Encord page. */
function getEncordPageCategory(): "home" | "projects" | "project_view" | "label_editor" | "other" | null {
  if (!isEncordDomain) return null
  const path = window.location.pathname
  if (path.includes("/label_editor/")) return "label_editor"
  if (path.includes("/projects/view")) return "project_view"
  if (path.includes("/projects/")) return "projects"
  if (path === "/" || path === "") return "home"
  return "other"
}

/** Extracts `{ projectId, dataId }` from a label editor URL. */
function parseLabelEditorParams(url: string): { projectId: string; dataId: string } | null {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split("/").filter(Boolean)
    const idx = segments.indexOf("label_editor")
    if (idx !== -1 && segments.length > idx + 2) {
      return {
        projectId: segments[idx + 1],
        dataId: segments[idx + 2]
      }
    }
  } catch {}
  return null
}


// ─────────────────────────────────────────────────────────────
// MOUSE CLICK TRACKING (with data-testid + task lifecycle)
// ─────────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  if (isBlockedUrl()) return
  const target = event.target as HTMLElement
  if (!target) return

  // Gather element descriptors
  const tag = target.tagName
  const id = target.id ? `#${target.id}` : ""
  const classes =
    target.classList && target.classList.length > 0
      ? `.${Array.from(target.classList).join(".")}`
      : ""
  const text = target.innerText ? target.innerText.trim().substring(0, 60) : ""

  // Capture data-testid from the element or its closest ancestor with it
  const dataTestId =
    target.getAttribute("data-testid") ||
    target.closest("[data-testid]")?.getAttribute("data-testid") ||
    null

  // ── Encord Task Lifecycle: high-priority event detection ──
  if (isEncordDomain && dataTestId) {
    if (dataTestId === "editor-task-skip") {
      const params = parseLabelEditorParams(window.location.href)
      chrome.runtime.sendMessage({
        type: "PAGE_EVENT",
        eventType: "TASK_SKIPPED",
        url: window.location.href,
        title: document.title,
        metadata: {
          dataTestId,
          projectId: params?.projectId ?? null,
          dataId: params?.dataId ?? null
        }
      }).catch(() => {})
    }
  }

  // Send the generic click event (always, with enhanced metadata)
  chrome.runtime.sendMessage({
    type: "PAGE_EVENT",
    eventType: "MOUSE_CLICK",
    url: window.location.href,
    title: document.title,
    metadata: {
      x: event.clientX,
      y: event.clientY,
      element: `${tag}${id}${classes}`,
      text,
      dataTestId
    }
  }).catch((err) => {
    console.debug("[WorkWise Tracker] Failed to send MOUSE_CLICK message:", err)
  })
}, true)

// ─────────────────────────────────────────────────────────────
// KEYBOARD TRACKING
// ─────────────────────────────────────────────────────────────

let keyBuffer: string[] = []
let keyTimeout: NodeJS.Timeout | null = null

function flushKeys() {
  if (keyBuffer.length === 0) return
  const keysPressed = keyBuffer.join("")
  keyBuffer = []

  chrome.runtime.sendMessage({
    type: "PAGE_EVENT",
    eventType: "KEYBOARD_INPUT",
    url: window.location.href,
    title: document.title,
    metadata: {
      keys: keysPressed,
      count: keysPressed.length
    }
  }).catch((err) => {
    console.debug("[WorkWise Tracker] Failed to send KEYBOARD_INPUT message:", err)
  })
}

document.addEventListener("keydown", (event) => {
  if (isBlockedUrl()) return
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return

  const isShortcut = event.ctrlKey || event.altKey || event.metaKey
  if (isShortcut) {
    const modifiers: string[] = []
    if (event.ctrlKey) modifiers.push("Ctrl")
    if (event.altKey) modifiers.push("Alt")
    if (event.shiftKey) modifiers.push("Shift")
    if (event.metaKey) modifiers.push("Meta")

    const shortcutStr = [...modifiers, event.key.toUpperCase()].join("+")
    chrome.runtime.sendMessage({
      type: "PAGE_EVENT",
      eventType: "KEYBOARD_SHORTCUT",
      url: window.location.href,
      title: document.title,
      metadata: { shortcut: shortcutStr, key: event.key }
    }).catch((err) => {
      console.debug("[WorkWise Tracker] Failed to send KEYBOARD_SHORTCUT message:", err)
    })
    return
  }

  // Keystroke content is recorded only on work-allowlist domains.
  if (!isWorkDomain()) return

  const target = event.target as HTMLElement
  if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "password") {
    keyBuffer.push("*")
  } else {
    if (event.key === "Enter") keyBuffer.push("[Enter]")
    else if (event.key === "Backspace") keyBuffer.push("[Backspace]")
    else if (event.key === "Tab") keyBuffer.push("[Tab]")
    else if (event.key === "Escape") keyBuffer.push("[Escape]")
    else if (event.key.length === 1) keyBuffer.push(event.key)
    else keyBuffer.push(`[${event.key}]`)
  }

  if (keyTimeout) clearTimeout(keyTimeout)
  if (keyBuffer.length >= 50) {
    flushKeys()
  } else {
    keyTimeout = setTimeout(flushKeys, 1500)
  }
}, true)

// ─────────────────────────────────────────────────────────────
// ENCORD TASK LIFECYCLE: URL-based TASK_STARTED / TASK_EXITED
// ─────────────────────────────────────────────────────────────

if (isEncordDomain) {
  let lastEditorUrl: string | null = null
  let lastEditorParams: { projectId: string; dataId: string } | null = null

  /**
   * Called whenever the page URL changes (SPA navigation).
   * Detects when the annotator enters or leaves the label editor.
   */
  function handleEncordNavigation(newUrl: string) {
    const category = getEncordPageCategory()

    // Detect: navigated INTO label editor
    if (category === "label_editor") {
      const params = parseLabelEditorParams(newUrl)
      // Only fire TASK_STARTED if it's a genuinely new task (different data-id)
      if (params && params.dataId !== lastEditorParams?.dataId) {
        console.log("[WorkWise Tracker] TASK_STARTED detected:", params)
        chrome.runtime.sendMessage({
          type: "PAGE_EVENT",
          eventType: "TASK_STARTED",
          url: newUrl,
          title: document.title,
          metadata: {
            projectId: params.projectId,
            dataId: params.dataId
          }
        }).catch(() => {})
        lastEditorUrl = newUrl
        lastEditorParams = params
      }
    } else if (lastEditorParams !== null) {
      // Detect: navigated OUT OF label editor without completing / skipping
      console.log("[WorkWise Tracker] TASK_EXITED detected (navigation away):", lastEditorParams)
      chrome.runtime.sendMessage({
        type: "PAGE_EVENT",
        eventType: "TASK_EXITED",
        url: newUrl,
        title: document.title,
        metadata: {
          previousUrl: lastEditorUrl,
          projectId: lastEditorParams.projectId,
          dataId: lastEditorParams.dataId,
          reason: "navigation"
        }
      }).catch(() => {})
      lastEditorUrl = null
      lastEditorParams = null
    }

    // Also emit an ENCORD_PAGE_VIEW event so we can measure time per Encord section
    if (category !== null) {
      chrome.runtime.sendMessage({
        type: "PAGE_EVENT",
        eventType: "ENCORD_PAGE_VIEW",
        url: newUrl,
        title: document.title,
        metadata: { category }
      }).catch(() => {})
    }
  }

  // Fire immediately for the current page load
  handleEncordNavigation(window.location.href)

  // SPA navigation watcher — Encord uses history.pushState / replaceState
  const _origPushState = history.pushState.bind(history)
  history.pushState = function (...args) {
    _origPushState(...args)
    // Use a tiny delay to let React/Vue update document.title first
    setTimeout(() => handleEncordNavigation(window.location.href), 100)
  }

  const _origReplaceState = history.replaceState.bind(history)
  history.replaceState = function (...args) {
    _origReplaceState(...args)
    setTimeout(() => handleEncordNavigation(window.location.href), 100)
  }

  window.addEventListener("popstate", () => {
    setTimeout(() => handleEncordNavigation(window.location.href), 100)
  })
}

// ─────────────────────────────────────────────────────────────
// ENCORD EMAIL EXTRACTION
// ─────────────────────────────────────────────────────────────

const isEncord = isEncordDomain || document.title.includes("Encord")

let isExtractingEmail = false

async function extractEncordEmail() {
  if (isExtractingEmail) return
  isExtractingEmail = true

  try {
    // 1. Check localStorage for cached email
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes("user") || key.includes("profile") || key.includes("auth"))) {
        const val = localStorage.getItem(key)
        if (val) {
          const match = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
          if (match) {
            console.log("[WorkWise Tracker] Extracted Encord email from cache:", match[0])
            chrome.runtime.sendMessage({
              type: "PAGE_EVENT",
              eventType: "ENCORD_EMAIL_CAPTURED",
              url: window.location.href,
              title: document.title,
              metadata: { email: match[0], source: "localStorage" }
            }).catch(() => {})
            isExtractingEmail = false
            return
          }
        }
      }
    }

    // 2. Fallback: scrape settings page in a hidden iframe
    console.log("[WorkWise Tracker] Launching background scraping iframe to retrieve email...")
    const iframe = document.createElement("iframe")
    iframe.src = "https://app.encord.com/settings/general"
    iframe.style.position = "fixed"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.opacity = "0"
    iframe.style.pointerEvents = "none"
    iframe.style.zIndex = "-9999"
    document.body.appendChild(iframe)

    let attempts = 0
    const maxAttempts = 30

    const pollInterval = setInterval(() => {
      attempts++
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (iframeDoc) {
          const h4s = Array.from(iframeDoc.querySelectorAll("h4.ant-list-item-meta-title"))
          const emailH4 = h4s.find(h4 => h4.textContent?.trim().toLowerCase() === "email")
          if (emailH4) {
            const listItem = emailH4.closest(".ant-list-item")
            if (listItem) {
              const divs = Array.from(listItem.children)
              const emailDiv = divs.find(
                child => !child.classList.contains("ant-list-item-meta") && child.tagName === "DIV"
              )
              const email = emailDiv?.textContent?.trim()
              if (email && email.includes("@")) {
                console.log("[WorkWise Tracker] Extracted Encord email via iframe:", email)
                chrome.runtime.sendMessage({
                  type: "PAGE_EVENT",
                  eventType: "ENCORD_EMAIL_CAPTURED",
                  url: window.location.href,
                  title: document.title,
                  metadata: { email, source: "iframe_scraping" }
                }).catch(() => {})
                clearInterval(pollInterval)
                if (iframe.parentNode) document.body.removeChild(iframe)
                isExtractingEmail = false
                return
              }
            }
          }
        }
      } catch (e) {
        console.debug("[WorkWise Tracker] Iframe parsing exception:", e)
      }

      if (attempts >= maxAttempts) {
        console.warn("[WorkWise Tracker] Encord email scraping timed out.")
        clearInterval(pollInterval)
        if (iframe.parentNode) document.body.removeChild(iframe)
        isExtractingEmail = false
      }
    }, 500)
  } catch (err) {
    console.error("[WorkWise Tracker] Error in Encord email extraction:", err)
    isExtractingEmail = false
  }
}

if (isEncord && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  const checkAndExtract = () => {
    chrome.storage.local.get(["sessionStatus", "encordEmail"], (data) => {
      if (data.sessionStatus === "active" && !data.encordEmail) {
        extractEncordEmail()
      }
    })
  }

  checkAndExtract()

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && (changes.sessionStatus || changes.encordEmail)) {
      checkAndExtract()
    }
  })
}
