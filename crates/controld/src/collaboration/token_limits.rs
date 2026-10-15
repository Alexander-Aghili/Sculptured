//! Per-agent token limits for one run (set on the agent in the team design). Usage is the CLIs'
//! reported, delayed evidence, so an agent can overshoot by up to one turn. Reaching the limit
//! soft-stops the agent: it wraps up with a summary, then stops with its subagents.
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

/// Running agents at their limit that are not already being stopped.
fn due(store: &Store) -> rusqlite::Result<Vec<String>> {
    let mut due = vec![];
    for rig in store.list_rigs()? {
        let Some(snap) = store.rig_snapshot(&rig.name)? else { continue };
        for view in snap.seats.iter().filter(|v| matches!(v.lifecycle, SeatLifecycle::Running | SeatLifecycle::Launching)) {
            let stopping = store.control(&view.id)?.is_some();
            if !stopping && reached(store, view)? {
                due.push(view.id.clone());
            }
        }
    }
    Ok(due)
}

pub async fn check(st: &AppState) {
    let due = match due(&st.store.lock().unwrap()) {
        Ok(d) => d,
        Err(e) => return tracing::warn!(error = %e, "token limits not checked"),
    };
    for seat in due {
        tracing::info!(%seat, "token limit reached; soft stop");
        if let Err(e) = super::control_agent(st, &seat, super::Control::Soft).await {
            tracing::warn!(%seat, error = %e.message, "token-limit stop will retry");
        }
    }
}
