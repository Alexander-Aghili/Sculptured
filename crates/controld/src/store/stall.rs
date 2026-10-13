//! Stall flags (heuristic, CS2680 D4 p52): the same tool error `REPEATS` times in a row marks the agent
//! stalled. Only flagged; the operator decides (nudge, restart fresh, soft stop).
use super::rows::query_events;
use crate::views::Stall;
use model::{EventBody, Subject};
use rusqlite::{params, Transaction};

const REPEATS: usize = 3;

/// A successful result clears the flag; an error that repeats the last ones sets it (once: the time it
/// started stays).
pub(super) fn on_tool_result(tx: &Transaction, seat: &str, is_error: bool, at_ms: i64) -> rusqlite::Result<()> {
    if !is_error {
        tx.execute("UPDATE seats SET stalled = NULL WHERE id = ?1", [seat])?;
        return Ok(());
    }
    let Some(error) = repeated_error(tx, seat)? else { return Ok(()) };
    let stall = Stall { reason: format!("the same tool error {REPEATS} times in a row: {error}"), at_ms };
    let json = serde_json::to_string(&stall).expect("a stall serializes");
    tx.execute("UPDATE seats SET stalled = ?2 WHERE id = ?1 AND stalled IS NULL", params![seat, json])?;
    Ok(())
}

/// The error's first line when the seat's last `REPEATS` tool results all failed with it.
fn repeated_error(tx: &Transaction, seat: &str) -> rusqlite::Result<Option<String>> {
    let sql = "SELECT json FROM events WHERE subject = ?1 AND json_extract(json, '$.body.type') = 'tool-resulted'
               ORDER BY seq DESC LIMIT ?2";
    let recent = query_events(tx, sql, params![Subject::Seat(seat.to_string()).key(), REPEATS as i64])?;
    let lines: Vec<Option<String>> = recent.iter().map(|e| match &e.body {
        EventBody::ToolResulted { is_error: true, output, .. } => Some(first_line(output)),
        _ => None,
    }).collect();
    let first = lines.first().cloned().flatten();
    Ok(first.filter(|l| lines.len() == REPEATS && lines.iter().all(|x| x.as_ref() == Some(l))))
}

fn first_line(output: &str) -> String {
    output.trim().lines().next().unwrap_or("").chars().take(200).collect()
}
