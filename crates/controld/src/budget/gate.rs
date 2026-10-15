//! The budget gate: every command that starts work (Launch, Restart, Send) passes it on its way to
//! a runner, whatever sent it (Start, a spawn, a copy, a dispatch, a handoff, a person's message).
//! Past the soft value nothing new starts; with "most agents working at once", a message to an idle
//! agent waits for a free slot. Interrupts, stops and answers are never held.
use super::record::BudgetState;
use crate::store::Store;
use host_proto::HostCommand;
use rusqlite::params;
use std::sync::{Arc, Mutex};

/// What the gate does with a command.
#[derive(Debug, PartialEq)]
pub enum Gate {
    Pass,
    /// Not sent, with the reason.
    Refuse(String),
    /// Kept to be sent when a slot frees; the sender is told it went.
    Queued,
}

fn seat_of(cmd: &HostCommand) -> Option<&str> {
    match cmd {
        HostCommand::Launch { seat, .. } | HostCommand::Restart { seat, .. } | HostCommand::Send { seat, .. } => Some(seat),
        _ => None,
    }
}

/// Agents of `rig` busy now: working, starting, or holding a message they have not begun.
pub fn busy(store: &Store, rig: &str, except: &str) -> rusqlite::Result<u32> {
    store.connection().query_row(
        "SELECT COUNT(*) FROM seats s WHERE s.rig = ?1 AND s.id <> ?2 AND (s.activity = 'working' OR s.lifecycle = 'launching'
           OR EXISTS (SELECT 1 FROM messages m WHERE m.seat = s.id AND m.state = 'delivered'))",
        params![rig, except],
        |r| r.get::<_, i64>(0).map(|n| n.max(0) as u32),
    )
}

fn queue(store: &Store, seat: &str, cmd: &HostCommand) -> rusqlite::Result<()> {
    let HostCommand::Send { message_id, .. } = cmd else { return Ok(()) };
    store.connection().execute(
        "INSERT OR IGNORE INTO budget_queue (seat, message_id, json, at_ms) VALUES (?1, ?2, ?3, ?4)",
        params![seat, message_id, serde_json::to_string(cmd).expect("command serializes"), model::now_ms()],
    )?;
    Ok(())
}

/// Why `rig` takes no new work now (its run is past a soft value), or None.
pub fn refusal(store: &Store, rig: &str) -> rusqlite::Result<Option<String>> {
    Ok(store.run_budget(rig)?.and_then(|r| match r.state {
        BudgetState::WrapUp { reason, .. } | BudgetState::Stopped { reason, .. } => Some(format!("Run budget: {reason}")),
        BudgetState::Normal => None,
    }))
}

/// The gate's answer for `cmd`, from the store alone (it runs inside every command).
pub fn decide(store: &Store, cmd: &HostCommand) -> rusqlite::Result<Gate> {
    let Some(seat) = seat_of(cmd) else { return Ok(Gate::Pass) };
    let Some(view) = store.seat(seat)? else { return Ok(Gate::Pass) };
    let Some(r) = store.run_budget(&view.rig)? else { return Ok(Gate::Pass) };
    let sending = matches!(cmd, HostCommand::Send { .. });
    match &r.state {
        BudgetState::Stopped { reason, .. } => return Ok(Gate::Refuse(format!("Run budget: {reason}"))),
        // The wrap-up instruction itself goes to agents that are wrapping up; nothing else does.
        BudgetState::WrapUp { .. } if sending && store.control(seat)?.is_some() => return Ok(Gate::Pass),
        BudgetState::WrapUp { reason, .. } => return Ok(Gate::Refuse(format!("Run budget: {reason}"))),
        BudgetState::Normal => {}
    }
    let Some(max) = r.budget.max_working.filter(|_| sending) else { return Ok(Gate::Pass) };
    let this_busy = view.activity == model::SeatActivity::Working;
    if !this_busy && busy(store, &view.rig, seat)? >= max {
        queue(store, seat, cmd)?;
        return Ok(Gate::Queued);
    }
    Ok(Gate::Pass)
}

/// The gate as the host registry calls it.
pub fn hook(store: Arc<Mutex<Store>>) -> crate::hosts::GateFn {
    Arc::new(move |cmd: &HostCommand| match decide(&store.lock().unwrap(), cmd) {
        Ok(g) => g,
        Err(e) => {
            tracing::warn!(error = %e, "budget gate could not read the store; passing the command");
            Gate::Pass
        }
    })
}

/// A waiting message: (seat, message id, the Send command).
type Waiting = (String, String, HostCommand);

fn waiting(store: &Store, rig: &str) -> rusqlite::Result<Vec<Waiting>> {
    let mut q = store.connection().prepare(
        "SELECT q.seat, q.message_id, q.json FROM budget_queue q JOIN seats s ON s.id = q.seat WHERE s.rig = ?1 ORDER BY q.at_ms, q.rowid",
    )?;
    let rows = q.query_map([rig], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?;
    Ok(rows.filter_map(Result::ok).filter_map(|(s, m, j)| Some((s, m, serde_json::from_str(&j).ok()?))).collect())
}

fn unqueue(store: &Store, message_id: &str) -> rusqlite::Result<()> {
    store.connection().execute("DELETE FROM budget_queue WHERE message_id = ?1", [message_id]).map(|_| ())
}

/// Sends waiting messages while slots are free, oldest first; past the soft value they are dropped
/// and recorded as not sent.
pub async fn deliver(st: &crate::state::AppState, rig: &str) -> rusqlite::Result<()> {
    let (list, record) = {
        let store = st.store.lock().unwrap();
        (waiting(&store, rig)?, store.run_budget(rig)?)
    };
    let Some(r) = record else { return Ok(()) };
    for (seat, message_id, cmd) in list {
        if !matches!(r.state, BudgetState::Normal) {
            unqueue(&st.store.lock().unwrap(), &message_id)?;
            let reason = "Not sent: the run's budget stopped new work".to_string();
            st.local_event(crate::hosts::controld(), model::Subject::Seat(seat), model::Provenance::Operator, model::EventBody::MessageFailed { message_id, reason })?;
            continue;
        }
        let free = r.budget.max_working.is_none_or(|max| busy(&st.store.lock().unwrap(), rig, &seat).is_ok_and(|n| n < max));
        if !free {
            return Ok(());
        }
        unqueue(&st.store.lock().unwrap(), &message_id)?;
        let Ok(host) = crate::launch::seat_host(st, &seat) else { continue };
        if let Err(e) = st.hosts.command_ungated(&host, cmd).await {
            st.local_event(crate::hosts::controld(), model::Subject::Seat(seat), model::Provenance::ProtocolObserved, model::EventBody::MessageFailed { message_id, reason: e.into_message() })?;
        }
    }
    Ok(())
}

/// Every team with messages waiting.
pub fn rigs_waiting(store: &Store) -> rusqlite::Result<Vec<String>> {
    let mut q = store.connection().prepare("SELECT DISTINCT s.rig FROM budget_queue q JOIN seats s ON s.id = q.seat")?;
    let rows = q.query_map([], |r| r.get(0))?;
    rows.collect()
}

/// Agents of `rig` with a message waiting for a slot (the board says so on their cards).
pub fn seats_waiting(store: &Store, rig: &str) -> rusqlite::Result<Vec<String>> {
    Ok(waiting(store, rig)?.into_iter().map(|w| w.0).collect())
}
