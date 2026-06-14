import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_end"
}

console.log("[WorkWise Tracker] Content script loaded and listening for user interactions.")

// Mouse click tracking
document.addEventListener("click", (event) => {
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
  // Ignore modifiers on their own
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
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
