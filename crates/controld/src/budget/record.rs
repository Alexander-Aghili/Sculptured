//! One run's budget, as recorded at Start, and what has been measured against it since.
use crate::store::Store;
use model::RunBudget;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

/// A plan reading during the run: the window's percent and the run's tokens on that plan when it came.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Reading {
    pub percent: f64,
    pub tokens: u64,
    pub at_ms: i64,
}

/// One budgeted plan window, followed through the run.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PlanTrack {
    pub provider: String,
    pub window: String,
    /// The window's percent when counting began: at Start, or at the first reading after it.
    pub baseline: Option<f64>,
    /// The run's tokens on this plan before the baseline was read (counted with the rate).
    pub base_tokens: u64,
    /// When the window being counted resets (a later value means a new window began).
    pub resets_at: Option<i64>,
    pub first: Option<Reading>,
    pub last: Option<Reading>,
    /// The highest share measured, in percent of the window.
    pub peak: f64,
}

/// Where the run stands against its budget.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(tag = "state", rename_all = "kebab-case")]
#[ts(export, export_to = "BudgetState.ts")]
pub enum BudgetState {
    #[default]
    Normal,
    /// The soft value was reached: no new work, every agent wraps up.
    WrapUp { reason: String, #[ts(type = "number")] at_ms: i64 },
    /// The hard value was reached: every agent was stopped at once.
    Stopped { reason: String, #[ts(type = "number")] at_ms: i64 },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Record {
    pub budget: RunBudget,
    pub start_seq: i64,
    pub start_ms: i64,
    pub plans: Vec<PlanTrack>,
    pub state: BudgetState,
    /// When the run wrapped up, kept after it is stopped (the history shows both).
    pub wrap_up_ms: Option<i64>,
    /// Highest token count measured.
    pub peak_tokens: u64,
}

impl Store {
    pub fn put_run_budget(&self, rig: &str, r: &Record) -> rusqlite::Result<()> {
        self.connection().execute(
            "INSERT INTO run_budgets (rig, start_seq, json) VALUES (?1, ?2, ?3)
             ON CONFLICT (rig, start_seq) DO UPDATE SET json = excluded.json",
            params![rig, r.start_seq, serde_json::to_string(r).expect("budget record serializes")],
        )?;
        Ok(())
    }

    /// The latest run's budget record of `rig`, if that run had a budget.
    pub fn run_budget(&self, rig: &str) -> rusqlite::Result<Option<Record>> {
        let json: Option<String> = self
            .connection()
            .query_row("SELECT json FROM run_budgets WHERE rig = ?1 ORDER BY start_seq DESC LIMIT 1", [rig], |r| r.get(0))
            .optional()?;
        Ok(json.and_then(|j| serde_json::from_str(&j).ok()))
    }

    /// Every rig whose latest run has a budget.
    pub fn budgeted_rigs(&self) -> rusqlite::Result<Vec<String>> {
        let mut q = self.connection().prepare("SELECT DISTINCT rig FROM run_budgets")?;
        let rows = q.query_map([], |r| r.get(0))?;
        rows.collect()
    }
}
