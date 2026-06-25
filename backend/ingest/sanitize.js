// Ingestion sanitization for telemetry events (Phase 2, Layer A).
//
// Responsibilities:
//   - validate + normalize the event envelope (drop unknown/malformed)
//   - clamp the timestamp and derive day / domain / encord_category / ids once
//   - per-event-type metadata ALLOWLIST (default-deny) so new fields can't leak
//   - keystroke privacy: KEYBOARD_INPUT.keys is kept ONLY on work-allowlist
//     domains; dropped everywhere else (defense-in-depth behind the extension
//     allowlist). Click coordinates/text are never stored.

import { dayKey } from "../db/schema.js"

export const KNOWN_EVENT_TYPES = new Set([
  "SESSION_STARTED", "SESSION_PAUSED", "SESSION_RESUMED", "SESSION_STOPPED",
  "TASK_STARTED", "TASK_SKIPPED", "TASK_EXITED",
  "IDLE_STATE_CHANGED", "ENCORD_PAGE_VIEW", "ENCORD_EMAIL_CAPTURED",
  "TAB_ACTIVATED", "TAB_UPDATED", "TAB_CLOSED",
  "WINDOW_FOCUSED", "WINDOW_UNFOCUSED",
  "MOUSE_CLICK", "KEYBOARD_INPUT", "KEYBOARD_SHORTCUT"
])

// Events stored as structured rows in raw_events (feed rollups + realtime modal).
const RAW_ROW_TYPES = new Set([
  "SESSION_STARTED", "SESSION_PAUSED", "SESSION_RESUMED", "SESSION_STOPPED",
  "TASK_STARTED", "TASK_SKIPPED", "TASK_EXITED",
  "IDLE_STATE_CHANGED", "ENCORD_PAGE_VIEW", "ENCORD_EMAIL_CAPTURED",
  "TAB_ACTIVATED", "TAB_UPDATED", "TAB_CLOSED",
  "WINDOW_FOCUSED", "WINDOW_UNFOCUSED"
])

// Per-type metadata allowlists (default-deny). Anything not listed is stripped.
const METADATA_ALLOWLIST = {
  SESSION_STARTED: [],
  SESSION_PAUSED: ["activeDurationMs"],
  SESSION_RESUMED: ["pauseDurationMs"],
  SESSION_STOPPED: ["totalSessionTimeMs", "totalActiveTimeMs", "totalPausedTimeMs", "pauseCount", "pauseHistory", "totalEvents"],
  TASK_STARTED: ["projectId", "dataId"],
  TASK_SKIPPED: ["dataTestId", "projectId", "dataId"],
  TASK_EXITED: ["previousUrl", "projectId", "dataId", "reason"],
  IDLE_STATE_CHANGED: ["state", "message"],
  ENCORD_PAGE_VIEW: ["category"],
  ENCORD_EMAIL_CAPTURED: ["email", "source"],
  TAB_ACTIVATED: ["tabId"],
  TAB_UPDATED: ["tabId", "status", "urlChanged"],
  TAB_CLOSED: ["tabId", "isWindowClosing"],
  WINDOW_FOCUSED: ["windowId", "tabId"],
  WINDOW_UNFOCUSED: ["message"],
  // KEYBOARD_INPUT.keys is handled specially below (work-domain only).
  KEYBOARD_INPUT: ["count"],
  KEYBOARD_SHORTCUT: ["shortcut", "key"],
  MOUSE_CLICK: [] // coordinates/element/text never stored
}

// Work-domain allowlist for keeping keystroke content. Configurable via env.
const WORK_DOMAINS = (process.env.WORK_DOMAINS || "encord.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)

export function isWorkDomain(domain) {
  if (!domain) return false
  const d = domain.toLowerCase()
  return WORK_DOMAINS.some((w) => d === w || d.endsWith("." + w))
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

const FUTURE_SKEW_MS = 5 * 60 * 1000
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function clampTimestamp(raw, nowMs) {
  const t = Date.parse(raw)
  if (!Number.isFinite(t) || t > nowMs + FUTURE_SKEW_MS || t < nowMs - MAX_AGE_MS) {
    return new Date(nowMs)
  }
  return new Date(t)
}

// Build the sanitized metadata object for an event, given its domain.
function sanitizeMetadata(eventType, metadata, domain) {
  const allow = METADATA_ALLOWLIST[eventType]
  if (!allow || !metadata || typeof metadata !== "object") return null
  const out = {}
  for (const key of allow) {
    if (metadata[key] !== undefined) out[key] = metadata[key]
  }
  // Keystroke content: keep `keys` only on work-allowlist domains.
  if (eventType === "KEYBOARD_INPUT" && isWorkDomain(domain) && typeof metadata.keys === "string") {
    out.keys = metadata.keys
  }
  return Object.keys(out).length ? out : null
}

// Normalize one raw event envelope. Returns a normalized event, or null to drop.
export function normalizeEvent(raw, nowMs = Date.now()) {
  if (!raw || typeof raw !== "object") return null
  const eventType = raw.eventType
  if (!KNOWN_EVENT_TYPES.has(eventType)) return null

  const tsDate = clampTimestamp(raw.timestamp, nowMs)
  const url = typeof raw.url === "string" ? raw.url : null
  const domain = domainOf(url)
  const md = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}

  return {
    eventType,
    ts: tsDate,
    day: dayKey(tsDate),
    url,
    title: typeof raw.title === "string" ? raw.title : null,
    domain,
    encordCategory: eventType === "ENCORD_PAGE_VIEW" ? (md.category ?? null) : null,
    projectId: md.projectId ?? null,
    dataId: md.dataId ?? null,
    metadata: sanitizeMetadata(eventType, md, domain)
  }
}

// Does this normalized event get a structured raw_events row?
// All Tier-1 types, plus KEYBOARD_INPUT only on work domains (to keep `keys`).
export function storesRawRow(ev) {
  if (RAW_ROW_TYPES.has(ev.eventType)) return true
  if (ev.eventType === "KEYBOARD_INPUT" && isWorkDomain(ev.domain)) return true
  return false
}

// Per-minute interaction deltas for folding, or null if not an interaction event.
export function foldInteraction(ev) {
  switch (ev.eventType) {
    case "MOUSE_CLICK":
      return { click: 1, shortcut: 0, keypressEvents: 0, keystrokes: 0 }
    case "KEYBOARD_SHORTCUT":
      return { click: 0, shortcut: 1, keypressEvents: 0, keystrokes: 0 }
    case "KEYBOARD_INPUT": {
      const n = Number(ev.metadata && ev.metadata.count)
      return { click: 0, shortcut: 0, keypressEvents: 1, keystrokes: Number.isFinite(n) ? n : 0 }
    }
    default:
      return null
  }
}
