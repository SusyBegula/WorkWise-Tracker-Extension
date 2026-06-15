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

// Mouse click tracking
document.addEventListener("click", (event) => {
  if (isBlockedUrl()) return
  const target = event.target as HTMLElement
  if (!target) return

  // Gather element descriptors
  const tag = target.tagName
  const id = target.id ? `#${target.id}` : ""
  const classes = target.classList && target.classList.length > 0 
    ? `.${Array.from(target.classList).join(".")}` 
    : ""
  const text = target.innerText ? target.innerText.trim().substring(0, 60) : ""

  chrome.runtime.sendMessage({
    type: "PAGE_EVENT",
    eventType: "MOUSE_CLICK",
    url: window.location.href,
    title: document.title,
    metadata: {
      x: event.clientX,
      y: event.clientY,
      element: `${tag}${id}${classes}`,
      text: text
    }
  }).catch((err) => {
    // Ignore runtime errors when message channel closes (e.g. extension reloaded)
    console.debug("[WorkWise Tracker] Failed to send MOUSE_CLICK message:", err)
  })
}, true)

// Keyboard input tracking with buffering to prevent terminal spam
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
  // Ignore modifiers on their own
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
    return
  }

  // Check if a shortcut is triggered (Ctrl, Alt, or Meta/Cmd is active)
  const isShortcut = event.ctrlKey || event.altKey || event.metaKey

  if (isShortcut) {
    const modifiers: string[] = []
    if (event.ctrlKey) modifiers.push("Ctrl")
    if (event.altKey) modifiers.push("Alt")
    if (event.shiftKey) modifiers.push("Shift")
    if (event.metaKey) modifiers.push("Meta")

    const keyName = event.key.toUpperCase()
    const shortcutStr = [...modifiers, keyName].join("+")

    chrome.runtime.sendMessage({
      type: "PAGE_EVENT",
      eventType: "KEYBOARD_SHORTCUT",
      url: window.location.href,
      title: document.title,
      metadata: {
        shortcut: shortcutStr,
        key: event.key
      }
    }).catch((err) => {
      console.debug("[WorkWise Tracker] Failed to send KEYBOARD_SHORTCUT message:", err)
    })
    return
  }

  // Handle password masking
  const target = event.target as HTMLElement
  if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "password") {
    keyBuffer.push("*")
  } else {
    // Map special keys for better log readability
    if (event.key === "Enter") {
      keyBuffer.push("[Enter]")
    } else if (event.key === "Backspace") {
      keyBuffer.push("[Backspace]")
    } else if (event.key === "Tab") {
      keyBuffer.push("[Tab]")
    } else if (event.key === "Escape") {
      keyBuffer.push("[Escape]")
    } else if (event.key.length === 1) {
      keyBuffer.push(event.key)
    } else {
      keyBuffer.push(`[${event.key}]`)
    }
  }

  if (keyTimeout) {
    clearTimeout(keyTimeout)
  }

  // Flush buffer if it grows large (50 chars) or after 1.5 seconds of inactivity
  if (keyBuffer.length >= 50) {
    flushKeys()
  } else {
    keyTimeout = setTimeout(flushKeys, 1500)
  }
}, true)

// Encord email extraction module
const isEncord = window.location.hostname.includes("app.encord.com") || document.title.includes("Encord")

let isExtractingEmail = false

async function extractEncordEmail() {
  if (isExtractingEmail) return
  isExtractingEmail = true

  try {
    // 1. Check local storage / session storage cache for any saved emails
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

    // 2. Fallback to scraping settings page via hidden iframe
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
    const maxAttempts = 30 // Poll for 15 seconds
    
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
              const emailDiv = divs.find(child => !child.classList.contains("ant-list-item-meta") && child.tagName === "DIV")
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
                if (iframe.parentNode) {
                  document.body.removeChild(iframe)
                }
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
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
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
