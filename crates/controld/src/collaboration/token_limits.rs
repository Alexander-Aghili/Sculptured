//! Per-agent limits for one run (set on the agent in the team design): tokens, turns and minutes
//! working, each counting the agents it started unless turned off for tokens. The soft value asks the
//! agent to wrap up with a summary; the hard value stops it and its subagents at once. Usage is
//! counted per model call (Claude) or per usage update (Codex).
use crate::state::AppState;
use crate::store::Store;
use crate::views::SeatView;
use model::{SeatLifecycle, Subject, TokenLimit};
use rusqlite::params;

/// `[input, output, cache_read, cache_write]` reported by `seat` after `start_seq`.
fn usage_since(store: &Store, seat: &str, start_seq: i64) -> rusqlite::Result<[u64; 4]> {
    let sum = |field: &str| format!("COALESCE(SUM(json_extract(json, '$.body.{field}')), 0)");
    let sql = format!(
        "SELECT {}, {}, {}, {} FROM events WHERE subject = ?1 AND seq > ?2 AND json_extract(json, '$.body.type') = 'usage-reported'",
        sum("input_tokens"), sum("output_tokens"), sum("cache_read_tokens"), sum("cache_write_tokens")
    );
    let key = Subject::Seat(seat.to_string()).key();
    store.connection().query_row(&sql, params![key, start_seq], |r| {
        Ok([r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64, r.get::<_, i64>(2)? as u64, r.get::<_, i64>(3)? as u64])
    })
}

/// `seat` and, recursively, every agent it spawned.
pub(crate) fn with_descendants(store: &Store, seat: &str) -> rusqlite::Result<Vec<String>> {
    let mut all = vec![seat.to_string()];
    let mut i = 0;
    while i < all.len() {
        all.extend(store.children(&all[i])?);
        i += 1;
    }
    Ok(all)
}

/// The agent's limit from its team design; None for agents without one (spawned children included).
pub fn limit_of(store: &Store, view: &SeatView) -> rusqlite::Result<Option<TokenLimit>> {
    let draft = store.draft(&view.rig)?;
    Ok(draft.and_then(|d| d.agents.into_iter().find(|a| a.id == view.member)).and_then(|a| a.advanced.token_limit))
}

/// Tokens counted against `limit` in the team's current run; None when the team has not started.
pub fn counted(store: &Store, view: &SeatView, limit: &TokenLimit) -> rusqlite::Result<Option<u64>> {
    let Some((start, _)) = crate::handoffs::current_start(store, &view.rig)? else { return Ok(None) };
    let seats = if limit.include_subagents { with_descendants(store, &view.id)? } else { vec![view.id.clone()] };
    let mut total = 0;
    for s in seats {
        total += limit.counts.of(usage_since(store, &s, start)?);
    }
    Ok(Some(total))
}

/// True when the agent has a limit and has reached it in this run.
pub fn reached(store: &Store, view: &SeatView) -> rusqlite::Result<bool> {
    let Some(limit) = limit_of(store, view)? else { return Ok(false) };
    Ok(counted(store, view, &limit)?.is_some_and(|used| used >= limit.tokens))
}

/// Turns started and minutes spent working by `seats` since `start_seq` (an open turn counts to `now`).
fn turns_and_minutes(store: &Store, seats: &[String], start_seq: i64, now: i64) -> rusqlite::Result<(u32, f64)> {
    let (mut turns, mut ms) = (0u32, 0i64);
    for seat in seats {
        let key = Subject::Seat(seat.clone()).key();
        let mut q = store.connection().prepare(
            "SELECT json_extract(json, '$.body.type'), at_ms FROM events WHERE subject = ?1 AND seq > ?2
             AND json_extract(json, '$.body.type') IN ('turn-started', 'turn-ended') ORDER BY seq",
        )?;
        let rows = q.query_map(params![key, start_seq], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
        let mut open: Option<i64> = None;
        for row in rows {
            match row? {
                (t, at) if t == "turn-started" => {
                    turns += 1;
                    open = Some(at);
                }
                (_, at) => ms += open.take().map_or(0, |o| at - o),
            }
        }
        ms += open.map_or(0, |o| now - o);
    }
    Ok((turns, ms.max(0) as f64 / 60_000.0))
}

/// The largest single report among the agent's seats (about one model call), times how many of them work now.
fn reserve(store: &Store, view: &SeatView, limit: &TokenLimit, start_seq: i64) -> rusqlite::Result<u64> {
    let seats = if limit.include_subagents { with_descendants(store, &view.id)? } else { vec![view.id.clone()] };
    let (mut max, mut working) = (0u64, 0u64);
    for s in &seats {
        let key = Subject::Seat(s.clone()).key();
        let n = "COALESCE(json_extract(json,'$.body.input_tokens'),0)+COALESCE(json_extract(json,'$.body.output_tokens'),0)+COALESCE(json_extract(json,'$.body.cache_read_tokens'),0)+COALESCE(json_extract(json,'$.body.cache_write_tokens'),0)";
        let m: i64 = store.connection().query_row(
            &format!("SELECT COALESCE(MAX({n}),0) FROM events WHERE subject = ?1 AND seq > ?2 AND json_extract(json,'$.body.type') = 'usage-reported'"),
            params![key, start_seq], |r| r.get(0))?;
        max = max.max(m.max(0) as u64);
        working += u64::from(store.seat(s)?.is_some_and(|v| v.activity == model::SeatActivity::Working));
    }
    Ok(max * working)
}

/// Why the agent must wrap up (soft) or stop now (hard), from its own limits; (None, None) when neither.
pub fn standing(store: &Store, view: &SeatView) -> rusqlite::Result<(Option<String>, Option<String>)> {
    let draft = store.draft(&view.rig)?;
    let Some(adv) = draft.and_then(|d| d.agents.into_iter().find(|a| a.id == view.member)).map(|a| a.advanced) else { return Ok((None, None)) };
    let Some((start, _)) = crate::handoffs::current_start(store, &view.rig)? else { return Ok((None, None)) };
    let (mut soft, mut hard) = (None, None);
    // `reserve`: what the working agents may still add before a stop reaches them.
    let mut judge = |what: &str, used: f64, s: f64, h: f64, reserve: f64, unit: &str| {
        if used + reserve >= h {
            hard.get_or_insert(format!("{what} limit: {used:.0} of {h:.0} {unit} used; stopped at once"));
        } else if used >= s {
            soft.get_or_insert(format!("{what} limit: {used:.0} {unit} used, past the soft limit of {s:.0}; wrapping up"));
        }
    };
    if let Some(t) = adv.token_limit {
        let used = counted(store, view, &t)?.unwrap_or(0);
        // A stop reaches an agent after the model call it is in: count one more call for each working agent.
        let reserve = reserve(store, view, &t, start)? as f64;
        judge("Token", used as f64, t.soft_value() as f64, t.tokens as f64, reserve, "tokens");
    }
    if adv.turn_limit.is_some() || adv.minute_limit.is_some() {
        let seats = with_descendants(store, &view.id)?;
        let (turns, minutes) = turns_and_minutes(store, &seats, start, model::now_ms())?;
        if let Some(t) = adv.turn_limit {
            judge("Turn", turns as f64, t.soft_value() as f64, t.hard as f64, 0.0, "turns");
        }
        if let Some(m) = adv.minute_limit {
            judge("Time", minutes, m.soft_value() as f64, m.hard as f64, 0.0, "minutes");
        }
    }
    Ok((soft, hard))
}

/// Running agents due a wrap-up (not already stopping) and agents due a stop now, with the reasons.
#[allow(clippy::type_complexity)]
fn due(store: &Store) -> rusqlite::Result<(Vec<(String, String)>, Vec<(String, String, String)>)> {
    let (mut soft, mut hard) = (vec![], vec![]);
    for rig in store.list_rigs()? {
        let Some(snap) = store.rig_snapshot(&rig.name)? else { continue };
        for view in snap.seats.iter().filter(|v| matches!(v.lifecycle, SeatLifecycle::Running | SeatLifecycle::Launching)) {
            match standing(store, view)? {
                (_, Some(why)) if store.control(&view.id)? != Some(crate::store::ControlMode::Hard) => hard.push((view.rig.clone(), view.id.clone(), why)),
                (Some(why), None) if store.control(&view.id)?.is_none() => soft.push((view.id.clone(), why)),
                _ => {}
            }
        }
    }
    Ok((soft, hard))
}

pub async fn check(st: &AppState) {
    let (soft, hard) = match due(&st.store.lock().unwrap()) {
        Ok(d) => d,
        Err(e) => return tracing::warn!(error = %e, "agent limits not checked"),
    };
    for (rig, seat, why) in hard {
        tracing::info!(%seat, %why, "agent limit: stop now");
        if let Err(e) = super::stop_now(st, &rig, std::slice::from_ref(&seat)).await {
            tracing::warn!(%seat, error = %e.message, "agent-limit stop will retry");
        }
    }
    for (seat, why) in soft {
        tracing::info!(%seat, %why, "agent limit: wrap up");
        if let Err(e) = super::control_agent(st, &seat, super::Control::Soft).await {
            tracing::warn!(%seat, error = %e.message, "agent-limit wrap-up will retry");
        }
    }
}
