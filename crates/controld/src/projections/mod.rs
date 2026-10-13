//! Projections of M2 events, one file per feature so the tracks never edit the same file.
use model::EventRecord;
use rusqlite::Transaction;

pub(crate) mod actions;
pub(crate) mod questions;

pub(crate) fn project(tx: &Transaction, ev: &EventRecord) -> rusqlite::Result<()> {
    questions::project(tx, ev)?;
    actions::project(tx, ev)
}
