// Transactional write path for a telemetry batch (Phase 2, Layer A).
//
// For one user's batch of NORMALIZED events (see sanitize.js), in a single
// transaction:
//   - insert Tier-1 + work-site keystroke events into raw_events
//   - fold MOUSE_CLICK / KEYBOARD_* into per-minute interaction_minutes counters
//   - insert a sessions row on SESSION_STOPPED (idempotent via dedupe_key)
//   - upsert user_status from the latest event in the batch
//
// One commit per batch keeps it idempotent against the extension's 500-retry:
// a committed batch is never re-sent, so additive counters can't double-count.

import { ensureRawPartition } from "../db/schema.js"
import { storesRawRow, foldInteraction } from "./sanitize.js"

// In-process cache of day-partitions we've already ensured exist.
const ensuredDays = new Set()

async function ensureDays(pool, days) {
  for (const day of days) {
    if (ensuredDays.has(day)) continue
    await ensureRawPartition(pool, day)
    ensuredDays.add(day)
  }
}

function minuteFloor(date) {
  return new Date(Math.floor(date.getTime() / 60000) * 60000)
}

export async function persistBatch(pool, email, events) {
  if (!events.length) return

  // Ensure raw_events partitions for every day in the batch (DDL, outside txn).
  await ensureDays(pool, [...new Set(events.map((e) => e.day))])

  const interaction = new Map() // minuteISO -> aggregate
  const rawRows = []
  const sessionRows = []
  let latest = null
  let sessionOpen = null // most recent session-open signal in batch (bool)
  let sessionOpenTs = -Infinity
  let lastIdle = null
  let lastIdleTs = -Infinity

  for (const ev of events) {
    const tms = ev.ts.getTime()
    if (!latest || tms > latest.ts.getTime()) latest = ev

    if (ev.eventType === "SESSION_STARTED" || ev.eventType === "SESSION_RESUMED") {
      if (tms >= sessionOpenTs) { sessionOpen = true; sessionOpenTs = tms }
    } else if (ev.eventType === "SESSION_PAUSED" || ev.eventType === "SESSION_STOPPED") {
      if (tms >= sessionOpenTs) { sessionOpen = false; sessionOpenTs = tms }
    }
    if (ev.eventType === "IDLE_STATE_CHANGED" && tms >= lastIdleTs) {
      lastIdle = ev.metadata ? ev.metadata.state ?? null : null
      lastIdleTs = tms
    }

    const fold = foldInteraction(ev)
    if (fold) {
      const minute = minuteFloor(ev.ts)
      const key = minute.toISOString()
      let agg = interaction.get(key)
      if (!agg) {
        agg = { minute, day: ev.day, click: 0, shortcut: 0, keypressEvents: 0, keystrokes: 0 }
        interaction.set(key, agg)
      }
      agg.click += fold.click
      agg.shortcut += fold.shortcut
      agg.keypressEvents += fold.keypressEvents
      agg.keystrokes += fold.keystrokes
    }

    if (storesRawRow(ev)) rawRows.push(ev)
    if (ev.eventType === "SESSION_STOPPED") sessionRows.push(ev)
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    for (const ev of rawRows) {
      await client.query(
        `INSERT INTO raw_events
           (email, event_type, ts, day, url, domain, encord_category, project_id, data_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [email, ev.eventType, ev.ts, ev.day, ev.url, ev.domain, ev.encordCategory,
         ev.projectId, ev.dataId, ev.metadata ? JSON.stringify(ev.metadata) : null]
      )
    }

    for (const agg of interaction.values()) {
      await client.query(
        `INSERT INTO interaction_minutes
           (email, minute, day, click_count, shortcut_count, keypress_events, keystroke_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (email, minute) DO UPDATE SET
           click_count     = interaction_minutes.click_count     + EXCLUDED.click_count,
           shortcut_count  = interaction_minutes.shortcut_count  + EXCLUDED.shortcut_count,
           keypress_events = interaction_minutes.keypress_events + EXCLUDED.keypress_events,
           keystroke_count = interaction_minutes.keystroke_count + EXCLUDED.keystroke_count`,
        [email, agg.minute, agg.day, agg.click, agg.shortcut, agg.keypressEvents, agg.keystrokes]
      )
    }

    for (const ev of sessionRows) {
      const m = ev.metadata || {}
      await client.query(
        `INSERT INTO sessions
           (email, day, stopped_at, total_ms, active_ms, paused_ms, pause_count, total_events, pause_history, dedupe_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [email, ev.day, ev.ts, m.totalSessionTimeMs ?? null, m.totalActiveTimeMs ?? null,
         m.totalPausedTimeMs ?? null, m.pauseCount ?? null, m.totalEvents ?? null,
         m.pauseHistory ? JSON.stringify(m.pauseHistory) : null, `${email}|${ev.ts.getTime()}`]
      )
    }

    if (latest) {
      // $3 last_idle_state and $4 session_open are null when the batch carried
      // no such signal -> COALESCE keeps the existing value (no false regress).
      await client.query(
        `INSERT INTO user_status (email, last_event_at, last_idle_state, session_open, updated_at)
         VALUES ($1, $2, $3, COALESCE($4, false), now())
         ON CONFLICT (email) DO UPDATE SET
           last_event_at   = GREATEST(user_status.last_event_at, EXCLUDED.last_event_at),
           last_idle_state = COALESCE($3, user_status.last_idle_state),
           session_open    = COALESCE($4, user_status.session_open),
           updated_at      = now()`,
        [email, latest.ts, lastIdle, sessionOpen]
      )
    }

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}
