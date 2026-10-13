use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What a tool call did, classified by Sculptured (spec §6.4). Always heuristic.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "kebab-case")]
#[ts(export)]
pub enum ActionClass {
    FileRead,
    FileEdit,
    ShellTestRun,
    ShellBuild,
    ShellGit,
    ShellInstall,
    ShellOther,
    Web,
    Mcp { server: String, tool: String },
    Skill { name: String },
    SubagentSpawn,
    Other,
}

/// A consequence worth a person's attention, in plain words. Never blocks anything.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct RiskFlag {
    /// Stable code, e.g. `force-push`, `outside-folder-delete`, `network-write`, `sudo`.
    pub code: String,
    /// Plain sentence, e.g. "force-pushed to origin main".
    pub text: String,
}
