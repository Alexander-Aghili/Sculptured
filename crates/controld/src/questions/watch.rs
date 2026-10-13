//! The timeout sweeper and the decision watcher: expiries fire on time, and after one the agent's
//! own words (or the end of its turn) record what it decided.
use super::answers::{allowed_on_timeout, expire};
use super::{record_or_log, timeout_actor, DECISION_CHARS, RESTARTED};
use crate::hosts::controld;
use crate::projections::questions::{questions_where, undecided_expired, QuestionRow, PROCESS_ENDED};
use crate::state::AppState;
use crate::store::is_live;
use model::{now_ms, Actor, DecisionSource, EventBody, EventRecord, Provenance, QuestionSource, Subject};
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

fn cut(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() } else { format!("{}…", s.chars().take(max).collect::<String>()) }
}

/// What `ev` says the agent decided: its next message, or "unknown" when its turn or process ends first.
fn decision_in(seat: &str, ev: &EventRecord) -> Option<(String, DecisionSource, Provenance, Actor)> {
    match &ev.body {
        EventBody::AgentText { text, .. } if !text.trim().is_empty() => {
            Some((cut(text.trim(), DECISION_CHARS), DecisionSource::NextMessage, Provenance::AgentReported, Actor::Seat(seat.to_string())))
        }
        EventBody::TurnEnded { .. } | EventBody::TenureEnded { .. } => {
            Some(("unknown".to_string(), DecisionSource::Unknown, Provenance::Heuristic, timeout_actor()))
        }
        _ => None,
    }
}

/// After an expiry the agent's decision is its `record_decision` call (Task 6), else its next message;
/// a turn or process that ends first leaves it unknown.
fn decide_from(st: &AppState, seat: &str, ev: &EventRecord) {
    let pending = match undecided_expired(st.store.lock().unwrap().connection(), seat) {
        Ok(p) => p,
        Err(e) => {
            tracing::error!(%seat, error = %e, "cannot read expired questions");
            return;
        }
    };
    for (id, after) in pending {
        if ev.seq <= after {
            continue;
        }
        if let Some((decision, source, provenance, actor)) = decision_in(seat, ev) {
            let body = EventBody::QuestionDecided { question_id: id.clone(), decision, rationale: None, source };
            record_or_log(st, seat, (actor, provenance), body, &id, "cannot record the decision");
        }
    }
}

/// After the hub lagged (or on start): replay each seat's events since its oldest undecided expiry.
fn catch_up(st: &AppState) {
    let seats: Vec<(String, i64)> = {
        let store = st.store.lock().unwrap();
        let mut q = match store.connection().prepare(
            "SELECT seat, MIN(expired_seq) FROM questions WHERE state = 'expired' AND decision_source IS NULL AND expired_seq IS NOT NULL GROUP BY seat",
        ) {
            Ok(q) => q,
            Err(e) => return tracing::error!(error = %e, "cannot read expired questions"),
        };
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).and_then(|rows| rows.collect()).unwrap_or_default()
    };
    for (seat, after) in seats {
        let events = st.store.lock().unwrap().events_for_seat(&seat, after, 2000).unwrap_or_default();
        for ev in &events {
            decide_from(st, &seat, ev);
        }
    }
}

/// True when the question was raised through a seat tool (request_input, or Claude's approve, stored as
/// NativePermission): seat-tool questions are recorded `agent-reported`; native ones (hostd's mapping)
/// `protocol-observed`.
fn through_tool(st: &AppState, q: &QuestionRow) -> bool {
    st.store
        .lock()
        .unwrap()
        .connection()
        .query_row(
            "SELECT json_extract(e.json, '$.provenance') = 'agent-reported'
             FROM events e JOIN questions q ON e.seq = q.opened_seq WHERE q.id = ?1",
            [&q.id],
            |r| r.get::<_, bool>(0),
        )
        .unwrap_or(q.source == QuestionSource::RequestInput)
}

/// Open questions nobody can answer any more: a `request_input` or `approve` whose waiting call died
/// with the old controld, or a question whose agent no longer runs.
fn withdraw_orphans(st: &AppState) {
    let open = questions_where(st.store.lock().unwrap().connection(), "state = 'open' ORDER BY opened_seq", []).unwrap_or_default();
    for q in open {
        let waiting = st.seat_waits.lock().unwrap().contains_key(&q.id);
        let live = st.store.lock().unwrap().seat(&q.seat).ok().flatten().is_some_and(|s| is_live(s.lifecycle));
        // Only the old controld's waiter could answer a seat-tool question, and hostd already failed
        // that call when the link dropped (Task 6), so the agent carried on.
        let reason = if through_tool(st, &q) && !waiting {
            Some(RESTARTED)
        } else if !live {
            Some(PROCESS_ENDED)
        } else {
            None
        };
        if let Some(reason) = reason {
            let body = EventBody::QuestionWithdrawn { question_id: q.id.clone(), reason: reason.into() };
            record_or_log(st, &q.seat, (controld(), Provenance::Heuristic), body, &q.id, "cannot withdraw an orphaned question");
        }
    }
}

fn due(st: &AppState) -> Vec<String> {
    let store = st.store.lock().unwrap();
    // Not while the agent's host is away (`stale`): the expiry could not reach the agent, and a native
    // question would stay blocked for good. It fires on the first tick after the seat runs again; a
    // process lost meanwhile is withdrawn instead.
    let mut q = match store.connection().prepare(
        "SELECT q.id FROM questions q JOIN seats s ON s.id = q.seat
         WHERE q.state = 'open' AND q.deadline_ms <= ?1 AND s.lifecycle != 'stale'",
    ) {
        Ok(q) => q,
        Err(e) => {
            tracing::error!(error = %e, "cannot read due questions");
            return Vec::new();
        }
    };
    q.query_map([now_ms()], |r| r.get(0)).and_then(|rows| rows.collect()).unwrap_or_default()
}

/// Timeout sweeper and decision watcher; `background::ensure_running` runs one per state.
pub async fn run(st: AppState) {
    let mut rx = st.hub.subscribe();
    withdraw_orphans(&st);
    catch_up(&st);
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            _ = tick.tick() => {
                for id in due(&st) {
                    let st = st.clone();
                    tokio::spawn(async move { expire(&st, &id).await });
                }
            }
            item = rx.recv() => match item {
                Ok(item) => {
                    if let Subject::Seat(seat) = &item.event.subject {
                        decide_from(&st, seat, &item.event);
                    }
                    // The program took an expiry that was in doubt: an expired permission prompt was allowed.
                    if let EventBody::QuestionResolved { question_id } = &item.event.body {
                        allowed_on_timeout(&st, question_id);
                    }
                }
                Err(RecvError::Lagged(_)) => catch_up(&st),
                Err(RecvError::Closed) => return,
            },
        }
    }
}

