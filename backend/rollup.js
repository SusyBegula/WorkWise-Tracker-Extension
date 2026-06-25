// Rollup engine (Phase 2, Layer B).
//
// Turns raw_events + sessions + interaction_minutes into the pre-computed
// insight tables the dashboard reads. Recompute is a pure function of a
// (email, day)'s rows: DELETE-by-key + INSERT inside a transaction, so it is
// idempotent regardless of out-of-order / duplicate raw rows.
//
// Scheduler: every ~2 min recompute every active "today" user, plus a daily
// finalize of yesterday + retention purge. Each pass is guarded by a Postgres
// advisory lock so it stays single-execution even if web scales to >1 instance.

import { dayKey } from "./db/schema.js"

const GAP_CLAMP_MS = 30 * 60 * 1000 // a single idle gap never attributes >30 min
const LOCK_RECOMPUTE = 911001
const LOCK_FINALIZE = 911002

// Recompute every rollup for one (email, day) from that day's raw data.
export async function recomputeDay(pool, email, day) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const { rows: evs } = await client.query(
      `SELECT event_type, ts, domain, encord_category, project_id, data_id, metadata
       FROM raw_events WHERE email = $1 AND day = $2 ORDER BY ts ASC, id ASC`,
      [email, day]
    )
    const { rows: sess } = await client.query(
      `SELECT active_ms, paused_ms, pause_count FROM sessions WHERE email = $1 AND day = $2`,
      [email, day]
    )
    const { rows: ints } = await client.query(
      `SELECT minute, click_count, shortcut_count, keypress_events FROM interaction_minutes
       WHERE email = $1 AND day = $2`,
      [email, day]
    )

    // --- session aggregates (client-computed totals) ---
    let activeMs = 0, pausedMs = 0, pauseCount = 0
    for (const s of sess) {
      activeMs += Number(s.active_ms || 0)
      pausedMs += Number(s.paused_ms || 0)
      pauseCount += Number(s.pause_count || 0)
    }
    const sessionCount = sess.length
    const focusRatio = activeMs + pausedMs > 0 ? activeMs / (activeMs + pausedMs) : null

    // --- task counts + spans (pair STARTED -> EXITED/SKIPPED by data_id) ---
    let tasksStarted = 0, tasksSkipped = 0, tasksExited = 0
    const openByData = new Map()
    const spans = []
    for (const e of evs) {
      if (e.event_type === "TASK_STARTED") {
        tasksStarted++
        openByData.set(e.data_id, { ts: e.ts, project_id: e.project_id })
      } else if (e.event_type === "TASK_SKIPPED" || e.event_type === "TASK_EXITED") {
        if (e.event_type === "TASK_SKIPPED") tasksSkipped++
        else tasksExited++
        const outcome = e.event_type === "TASK_SKIPPED" ? "skipped" : "exited"
        const open = openByData.get(e.data_id)
        if (open) {
          spans.push({ project_id: open.project_id ?? e.project_id, data_id: e.data_id,
            started_at: open.ts, ended_at: e.ts, duration_ms: e.ts.getTime() - open.ts.getTime(), outcome })
          openByData.delete(e.data_id)
        } else {
          spans.push({ project_id: e.project_id, data_id: e.data_id,
            started_at: null, ended_at: e.ts, duration_ms: null, outcome })
        }
      }
    }
    for (const [dataId, open] of openByData) {
      spans.push({ project_id: open.project_id, data_id: dataId,
        started_at: open.ts, ended_at: null, duration_ms: null, outcome: "open" })
    }
    const completed = spans.filter((s) => s.duration_ms != null)
    const avgTaskMs = completed.length
      ? Math.round(completed.reduce((a, s) => a + s.duration_ms, 0) / completed.length) : null

    // --- domain + Encord-section time (attribute gaps while active & not idle) ---
    const domainTime = new Map()
    const sectionTime = new Map()
    let sessionOpen = false, idle = false, curDomain = null, curCategory = null
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i]
      if (e.event_type === "SESSION_STARTED" || e.event_type === "SESSION_RESUMED") sessionOpen = true
      else if (e.event_type === "SESSION_PAUSED" || e.event_type === "SESSION_STOPPED") sessionOpen = false
      if (e.event_type === "IDLE_STATE_CHANGED") {
        const st = e.metadata && e.metadata.state
        idle = st === "idle" || st === "locked"
      }
      if (e.domain) curDomain = e.domain
      if (e.event_type === "ENCORD_PAGE_VIEW" && e.encord_category) curCategory = e.encord_category

      if (i + 1 < evs.length) {
        const gap = Math.min(evs[i + 1].ts.getTime() - e.ts.getTime(), GAP_CLAMP_MS)
        if (gap > 0 && sessionOpen && !idle) {
          if (curDomain) domainTime.set(curDomain, (domainTime.get(curDomain) || 0) + gap)
          if (curDomain && curDomain.endsWith("encord.com") && curCategory) {
            sectionTime.set(curCategory, (sectionTime.get(curCategory) || 0) + gap)
          }
        }
      }
    }

    const firstActive = evs.length ? evs[0].ts : null
    const lastActive = evs.length ? evs[evs.length - 1].ts : null

    // --- hourly event-type counts (raw rows + folded interactions) ---
    const hourly = new Map() // "hour|event_type" -> cnt
    const bump = (hour, type, n) => {
      if (n <= 0) return
      const k = hour + "|" + type
      hourly.set(k, (hourly.get(k) || 0) + n)
    }
    // KEYBOARD_INPUT is counted via interaction_minutes (keypress_events) for
    // ALL domains, so skip the work-domain raw rows here to avoid double-count.
    for (const e of evs) {
      if (e.event_type !== "KEYBOARD_INPUT") bump(e.ts.getUTCHours(), e.event_type, 1)
    }
    for (const m of ints) {
      const h = new Date(m.minute).getUTCHours()
      bump(h, "MOUSE_CLICK", Number(m.click_count))
      bump(h, "KEYBOARD_SHORTCUT", Number(m.shortcut_count))
      bump(h, "KEYBOARD_INPUT", Number(m.keypress_events))
    }

    // --- write (idempotent: delete-by-key then insert) ---
    await client.query(`DELETE FROM daily_user_stats WHERE email = $1 AND day = $2`, [email, day])
    await client.query(
      `INSERT INTO daily_user_stats
        (email, day, active_ms, paused_ms, session_count, pause_count, focus_ratio,
         tasks_started, tasks_skipped, tasks_exited, avg_task_ms, first_active, last_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [email, day, activeMs, pausedMs, sessionCount, pauseCount, focusRatio,
       tasksStarted, tasksSkipped, tasksExited, avgTaskMs, firstActive, lastActive]
    )

    await client.query(`DELETE FROM daily_domain_time WHERE email = $1 AND day = $2`, [email, day])
    for (const [domain, ms] of domainTime) {
      await client.query(
        `INSERT INTO daily_domain_time (email, day, domain, active_ms) VALUES ($1,$2,$3,$4)`,
        [email, day, domain, ms]
      )
    }

    await client.query(`DELETE FROM daily_encord_section_time WHERE email = $1 AND day = $2`, [email, day])
    for (const [cat, ms] of sectionTime) {
      await client.query(
        `INSERT INTO daily_encord_section_time (email, day, category, active_ms) VALUES ($1,$2,$3,$4)`,
        [email, day, cat, ms]
      )
    }

    await client.query(`DELETE FROM daily_event_counts_hourly WHERE email = $1 AND day = $2`, [email, day])
    for (const [k, cnt] of hourly) {
      const sep = k.indexOf("|")
      const hour = Number(k.slice(0, sep))
      const type = k.slice(sep + 1)
      await client.query(
        `INSERT INTO daily_event_counts_hourly (email, day, hour, event_type, cnt) VALUES ($1,$2,$3,$4,$5)`,
        [email, day, hour, type, cnt]
      )
    }

    await client.query(`DELETE FROM task_spans WHERE email = $1 AND day = $2`, [email, day])
    for (const s of spans) {
      const dedupe = `${email}|${s.data_id}|${s.started_at ? s.started_at.getTime() : "na"}`
      await client.query(
        `INSERT INTO task_spans (email, day, project_id, data_id, started_at, ended_at, duration_ms, outcome, dedupe_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (dedupe_key) DO NOTHING`,
        [email, day, s.project_id, s.data_id, s.started_at, s.ended_at, s.duration_ms, s.outcome, dedupe]
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

// Team-level daily KPIs, derived from daily_user_stats.
export async function recomputeTeamDay(pool, day) {
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE active_ms > 0 OR session_count > 0) AS annotators,
       COALESCE(sum(active_ms), 0) AS team_active,
       COALESCE(sum(paused_ms), 0) AS team_paused,
       COALESCE(sum(tasks_started), 0) AS ts,
       COALESCE(sum(tasks_skipped), 0) AS tk,
       COALESCE(sum(session_count), 0) AS sc
     FROM daily_user_stats WHERE day = $1`,
    [day]
  )
  const r = rows[0]
  const teamActive = Number(r.team_active)
  const teamPaused = Number(r.team_paused)
  const focus = teamActive + teamPaused > 0 ? teamActive / (teamActive + teamPaused) : null
  const skipRate = Number(r.ts) > 0 ? Number(r.tk) / Number(r.ts) : null
  const avgSession = Number(r.sc) > 0 ? Math.round(teamActive / Number(r.sc)) : null
  await pool.query(
    `INSERT INTO daily_team_stats
       (day, active_annotators, team_active_ms, tasks_started, tasks_skipped, skip_rate, focus_ratio, avg_session_ms, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (day) DO UPDATE SET
       active_annotators = EXCLUDED.active_annotators,
       team_active_ms    = EXCLUDED.team_active_ms,
       tasks_started     = EXCLUDED.tasks_started,
       tasks_skipped     = EXCLUDED.tasks_skipped,
       skip_rate         = EXCLUDED.skip_rate,
       focus_ratio       = EXCLUDED.focus_ratio,
       avg_session_ms    = EXCLUDED.avg_session_ms,
       updated_at        = now()`,
    [day, Number(r.annotators), teamActive, Number(r.ts), Number(r.tk), skipRate, focus, avgSession]
  )
}

// Recompute every user who has any activity on `day`, then the team rollup.
export async function recomputeActiveDay(pool, day) {
  const { rows } = await pool.query(
    `SELECT email FROM raw_events WHERE day = $1 GROUP BY email
     UNION
     SELECT email FROM interaction_minutes WHERE day = $1 GROUP BY email`,
    [day]
  )
  for (const r of rows) await recomputeDay(pool, r.email, day)
  await recomputeTeamDay(pool, day)
  return rows.length
}

// Retention: drop raw_events day-partitions older than retentionDays; trim
// interaction_minutes on the same window.
export async function purgeExpired(pool, retentionDays = 30) {
  const cutoffKey = dayKey(new Date(Date.now() - retentionDays * 86400000))
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'raw_events_p_%'`
  )
  for (const r of rows) {
    const m = r.tablename.match(/^raw_events_p_(\d{4})(\d{2})(\d{2})$/)
    if (!m) continue
    const pday = `${m[1]}-${m[2]}-${m[3]}`
    if (pday < cutoffKey) await pool.query(`DROP TABLE IF EXISTS ${r.tablename}`)
  }
  await pool.query(`DELETE FROM interaction_minutes WHERE day < $1`, [cutoffKey])
}

// Run `fn` only if we win the advisory lock (single-execution across instances).
async function withLock(pool, key, fn) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [key])
    if (!rows[0].ok) return false
    try {
      await fn()
      return true
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [key])
    }
  } finally {
    client.release()
  }
}

export function startRollupScheduler(pool) {
  const recompute = async () => {
    try {
      await withLock(pool, LOCK_RECOMPUTE, async () => {
        await recomputeActiveDay(pool, dayKey(new Date()))
      })
    } catch (e) {
      console.error("Rollup recompute error:", e.message)
    }
  }

  let lastFinalized = null
  const finalize = async () => {
    const today = dayKey(new Date())
    if (lastFinalized === today) return
    try {
      const ran = await withLock(pool, LOCK_FINALIZE, async () => {
        const yesterday = dayKey(new Date(Date.now() - 86400000))
        await recomputeActiveDay(pool, yesterday)
        await purgeExpired(pool, Number(process.env.RAW_TTL_DAYS || 30))
      })
      if (ran) lastFinalized = today
    } catch (e) {
      console.error("Rollup finalize error:", e.message)
    }
  }

  setTimeout(recompute, 5000)            // shortly after boot
  setInterval(recompute, 2 * 60 * 1000)  // every 2 minutes
  setInterval(finalize, 10 * 60 * 1000)  // daily finalize + purge (checks once it crosses a day)
  console.log("Rollup scheduler started (2-min recompute + daily finalize).")
}
