//! `sculptured.team/v1`: every structural detail of a team, without machine-specific folders unless asked.
use crate::api::{fingerprint, idempotent};
use crate::error::{respond, to_value, ApiError};
use crate::extract::{Json, Path, Query};
use crate::state::AppState;
use crate::views::{TeamRecord, TeamSettings};
use axum::extract::State;
use axum::response::Response;
use model::{DraftIssue, TeamDraft};
use rigspec::{Diagnostic, Severity};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const TEAM_FORMAT: &str = "sculptured.team/v1";
/// Where the team file's JSON Schema is published (every Sculptured also serves it at `/schema/team-v1.json`).
pub const TEAM_SCHEMA_URL: &str = "https://docs.usesculptured.com/schema/team-v1.json";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[schemars(title = "sculptured.team/v1")]
pub struct TeamFile {
    /// The file's JSON Schema, for editors that validate and complete it. Written on export; any value is
    /// accepted on import.
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Always "sculptured.team/v1".
    #[schemars(regex(pattern = r"^sculptured\.team/v1$"))]
    pub format: String,
    pub team: model::TeamDraft,
    #[serde(default)]
    pub settings: PortableSettings,
}

/// The team settings that are part of its structure (not which computer runs it).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PortableSettings {
    /// None: the global setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub posture: Option<model::PermissionPosture>,
    /// Each Claude Code / Codex agent works in its own git copy.
    #[serde(default)]
    pub own_copies: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub question_timeout_min: Option<u32>,
}

/// The file for a team as saved (`include_folders`: keep this computer's folder paths).
pub fn to_file(mut team: TeamDraft, s: &TeamSettings, include_folders: bool) -> TeamFile {
    team.revision = 0;
    if !include_folders {
        team.folder = None;
        for a in &mut team.agents {
            a.folder = None;
        }
    }
    let settings = PortableSettings { posture: s.posture, own_copies: s.own_copies, question_timeout_min: s.question_timeout_min };
    TeamFile { schema: Some(TEAM_SCHEMA_URL.into()), format: TEAM_FORMAT.into(), team, settings }
}

pub fn export_team(st: &AppState, id: &str, include_folders: bool) -> Result<TeamFile, ApiError> {
    let store = st.store.lock().unwrap();
    let team = store.draft(id)?.ok_or_else(|| ApiError::not_found(format!("no team {id:?}")))?;
    Ok(to_file(team, &store.team_settings(id)?, include_folders))
}

fn invalid(path: &str, message: impl Into<String>) -> ApiError {
    let d = Diagnostic { path: path.into(), severity: Severity::Error, message: message.into() };
    ApiError::unprocessable("team_file_invalid", "This is not a Sculptured team file that can be read", vec![d])
}

/// The file parsed and checked, with its issues; every issue when it does not hold together. Creates nothing.
pub fn import_team_file(st: &AppState, file: serde_json::Value) -> Result<(TeamFile, Vec<DraftIssue>), ApiError> {
    match file.get("format").and_then(|f| f.as_str()) {
        Some(TEAM_FORMAT) => {}
        Some(other) => return Err(invalid("format", format!("This file is {other:?}; Sculptured reads \"{TEAM_FORMAT}\" team files"))),
        None => return Err(invalid("format", format!("No \"format\": expected a \"{TEAM_FORMAT}\" team file"))),
    }
    let parsed: TeamFile = serde_path_to_error::deserialize(file).map_err(|e| invalid(&e.path().to_string(), e.inner().to_string()))?;
    let issues = crate::teams::issues_for(st, &parsed.team);
    if issues.iter().any(|i| crate::teams::is_error(i) && BROKEN.contains(&i.code.as_str())) {
        return Err(ApiError::invalid_team(issues));
    }
    Ok((parsed, issues))
}

/// Errors that mean the file does not hold together (ids, references, malformed parts). Other issues
/// — a missing folder or name, an empty team — are what Design shows on any draft, so the team is
/// imported and they come back as warnings.
const BROKEN: &[&str] = &[
    "team-id-invalid", "agent-id-invalid", "group-id-invalid", "agent-group-missing", "connection-dangling",
    "connection-duplicate", "workflow-invalid", "team-config", "group-config", "agent-config", "connection-config",
];

/// Inserts the file's team under a fresh id, with its settings.
pub(crate) fn create(st: &AppState, file: TeamFile) -> Result<TeamDraft, ApiError> {
    let mut draft = file.team;
    let mut store = st.store.lock().unwrap();
    draft.id = crate::teams::new_team_id(&store, &draft.name);
    draft.revision = 0;
    store.insert_draft(&draft)?;
    let s = file.settings;
    store.save_team_settings(&draft.id, &TeamSettings { posture: s.posture, question_timeout_min: s.question_timeout_min, own_copies: s.own_copies, host: None })?;
    Ok(draft)
}

#[derive(Deserialize)]
pub(super) struct FileQuery {
    #[serde(default)]
    folders: bool,
}

pub(super) async fn get_file(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>) -> Response {
    respond(export_team(&st, &id, q.folders))
}

#[derive(Deserialize, Serialize)]
pub(super) struct ImportFileReq {
    #[serde(default)]
    request_id: String,
    file: serde_json::Value,
    /// Where the file came from (e.g. generated by AI), kept as the team's provenance.
    #[serde(default)]
    origin: Option<crate::views::TeamOrigin>,
}

#[derive(Serialize)]
struct Imported {
    team: TeamRecord,
    warnings: Vec<DraftIssue>,
}

pub(super) async fn import_file(State(st): State<AppState>, Json(req): Json<ImportFileReq>) -> Response {
    let fp = fingerprint("import-team-file", &req);
    let request_id = req.request_id.clone();
    let st2 = st.clone();
    idempotent(&st, &request_id, fp, move || async move {
        let (file, warnings) = import_team_file(&st2, req.file)?;
        let draft = create(&st2, file)?;
        if let Some(origin) = &req.origin {
            st2.store.lock().unwrap().set_team_origin(&draft.id, origin)?;
        }
        let how = if req.origin.as_ref().is_some_and(|o| o.kind == "generated") { "generated" } else { "file" };
        crate::analytics::emit(&st2, "team.created", serde_json::json!({ "template": how }));
        to_value(&Imported { team: crate::teams::record(&st2, draft)?, warnings })
    })
    .await
}

#[derive(Deserialize)]
pub(super) struct CheckFileReq {
    file: serde_json::Value,
}

#[derive(Serialize)]
struct Checked {
    issues: Vec<DraftIssue>,
}

/// The import's checks, without creating anything (the accept/reject board's live issues).
pub(super) async fn check_file(State(st): State<AppState>, Json(req): Json<CheckFileReq>) -> Response {
    respond(import_team_file(&st, req.file).map(|(_, issues)| Checked { issues }))
}
