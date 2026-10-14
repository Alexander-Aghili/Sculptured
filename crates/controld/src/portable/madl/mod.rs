//! MADL (the Multi-Agent Descriptor Language): a team as a vendor-neutral `.madl.yaml` file, and
//! MADL files imported as teams.
mod agents;
mod export;
mod import;
mod links;
mod workflow;

pub use export::to_madl;
pub use import::{from_madl, Imported};
pub use workflow::is_tagged as is_drawn_from_workflow;

use crate::api::{fingerprint, idempotent};
use crate::error::{respond, to_value, ApiError};
use crate::extract::{Json, Path, Query};
use crate::state::AppState;
use crate::views::TeamImport;
use axum::extract::State;
use axum::response::Response;
use rigspec::{Diagnostic, Severity};
use serde::{Deserialize, Serialize};

/// Sculptured's extension namespace in MADL documents.
pub const NS: &str = "com.usesculptured";

/// The team as MADL YAML.
pub fn export_yaml(st: &AppState, id: &str, include_folders: bool) -> Result<String, ApiError> {
    let file = crate::portable::team::export_team(st, id, include_folders)?;
    serde_yaml_ng::to_string(&to_madl(&file)).map_err(|e| ApiError::internal(format!("could not write MADL: {e}")))
}

fn diagnostics(found: impl IntoIterator<Item = madl::Diagnostic>) -> Vec<Diagnostic> {
    let severity = |s| if s == madl::Severity::Error { Severity::Error } else { Severity::Warning };
    found.into_iter().map(|d| Diagnostic { path: d.path, severity: severity(d.severity), message: format!("{} ({})", d.message, d.code) }).collect()
}

/// Parse, validate and convert MADL text. A file that refers to other files can't be read here:
/// upload it as one file (`madl expand` joins them).
pub fn read(text: &str) -> Result<Imported, ApiError> {
    let invalid = |d| ApiError::unprocessable("madl_invalid", "This MADL file has errors", d);
    let nowhere = std::env::temp_dir().join("sculptured-madl-upload-has-no-folder");
    let doc = madl::from_str(text, &nowhere, &madl::Options::default()).map_err(|e| invalid(diagnostics([e.0])))?;
    let report = madl::validate(&doc);
    if !report.is_ok() {
        return Err(invalid(diagnostics(report.diagnostics)));
    }
    Ok(from_madl(&madl::expand(&doc)))
}

#[derive(Deserialize)]
pub(super) struct FileQuery {
    #[serde(default)]
    folders: bool,
}

#[derive(Serialize)]
struct Exported {
    yaml: String,
}

pub(super) async fn get_madl(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>) -> Response {
    respond(export_yaml(&st, &id, q.folders).map(|yaml| Exported { yaml }))
}

#[derive(Deserialize, Serialize)]
pub(super) struct ImportReq {
    #[serde(default)]
    request_id: String,
    text: String,
}

pub(super) async fn import_madl(State(st): State<AppState>, Json(req): Json<ImportReq>) -> Response {
    let fp = fingerprint("import-madl", &req);
    let request_id = req.request_id.clone();
    let st2 = st.clone();
    idempotent(&st, &request_id, fp, move || async move {
        let Imported { file, dropped } = read(&req.text)?;
        let (file, _warnings) = crate::portable::team::import_team_file(&st2, serde_json::to_value(&file).map_err(|e| ApiError::internal(e.to_string()))?)?;
        let draft = crate::portable::team::create(&st2, file)?;
        crate::analytics::emit(&st2, "team.created", serde_json::json!({ "template": "file" }));
        to_value(&TeamImport { team: crate::teams::record(&st2, draft)?, dropped })
    })
    .await
}
