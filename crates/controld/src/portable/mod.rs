//! Portable formats: a team's structure (`sculptured.team/v1`) and a run (`sculptured.session/v1`),
//! with JSON Schemas generated from these same types and published under `web/public/schema/`.
pub mod session;
pub mod team;

use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;
use schemars::Schema;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/teams/{id}/file", get(team::get_file))
        .route("/api/teams/import-file", post(team::import_file))
        .route("/api/teams/check-file", post(team::check_file))
        .route("/api/teams/{id}/deployments/{seq}/session", get(session::get_session))
        // A run file can be large: up to 64 MB on this route only.
        .route("/api/runs/import", post(session::post_import).layer(axum::extract::DefaultBodyLimit::max(64 << 20)))
}

/// (file name under `web/public/schema`, schema) for each published format.
pub fn schemas() -> Vec<(&'static str, Schema)> {
    let team = schemars::schema_for!(team::TeamFile);
    // A session file is JSON lines: line 1 is the header, every later line one event.
    let mut generator = schemars::generate::SchemaSettings::draft2020_12().into_generator();
    let header = generator.subschema_for::<session::SessionHeader>();
    let line = generator.subschema_for::<session::SessionLine>();
    let defs = generator.take_definitions(true);
    let session: Schema = serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "sculptured.session/v1 line",
        "description": "One line of a .sculptured-session.jsonl file: the first line is a SessionHeader, each later line a SessionLine.",
        "oneOf": [header, line],
        "$defs": defs,
    })
    .try_into()
    .expect("a schema object");
    vec![("team-v1.json", team), ("session-v1.json", session)]
}
