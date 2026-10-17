//! An agent's contract (MADL `data_access` and `authority`): what it reads and writes, what else it
//! changes, and the decisions it owns. Sculptured tells the team, and its protections refuse file
//! reads and writes outside the contract where they can tell.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Paths relative to the agent's folder; a trailing `/` or `/**` covers a folder.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct DataAccess {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub reads: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub writes: Vec<String>,
    /// Effects beyond its files, in plain words.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[ts(as = "Option<Vec<String>>", optional)]
    pub side_effects: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rationale: Option<String>,
}

impl DataAccess {
    pub fn is_empty(&self) -> bool {
        self.reads.is_empty() && self.writes.is_empty() && self.side_effects.is_empty() && self.rationale.is_none()
    }
}

/// The decisions an agent owns, in plain words.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct Authority {
    #[serde(default)]
    pub domains: Vec<String>,
    /// How far its decisions reach: a group id, or `system` for the whole team. None: its own work.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rationale: Option<String>,
}
