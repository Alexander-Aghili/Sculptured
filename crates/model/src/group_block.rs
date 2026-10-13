//! A reusable board fragment stored independently from projects and runs.
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use crate::TeamDraft;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct GroupBlock {
    pub id: String,
    pub name: String,
    #[ts(type = "number")]
    pub revision: u64,
    pub draft: TeamDraft,
    /// Cross-boundary connections from the source, for the operator to reconnect on insertion.
    pub boundary_notes: Vec<String>,
}
