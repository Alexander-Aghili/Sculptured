//! Reversible sidebar visibility. Trash retains drafts, files and deployment history.
use crate::{error::{ApiError, respond}, extract::{Json, Path}, state::AppState, store::Store};
use axum::{Router, extract::State, response::Response, routing::get};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../../web/src/generated/")]
pub enum ProjectVisibilityStatus { Visible, Hidden, Trashed }
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../web/src/generated/")]
pub struct ProjectVisibility { pub id: String, pub status: ProjectVisibilityStatus }
pub fn routes() -> Router<AppState> {
    Router::new().route("/api/project-visibility", get(list)).route("/api/project-visibility/{id}", axum::routing::put(update))
}
pub(crate) fn ensure_available(store: &Store, id: &str) -> Result<(), ApiError> {
    let status: Option<String> = store.connection().query_row("SELECT status FROM project_visibility WHERE id=?1", [id], |r|r.get(0)).optional()?;
    if status.as_deref()==Some("trashed") { return Err(ApiError::conflict("project_trashed", "Restore this project from Trash first")); }
    Ok(())
}
async fn list(State(st): State<AppState>) -> Response {
    respond((|| -> Result<Vec<ProjectVisibility>,ApiError> {
        let store=st.store.lock().unwrap();
        let mut q=store.connection().prepare("SELECT id,status FROM project_visibility ORDER BY id")?;
        let rows=q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()?;
        Ok(rows.into_iter().map(|(id,status)|ProjectVisibility{id,status:if status=="trashed" {ProjectVisibilityStatus::Trashed} else {ProjectVisibilityStatus::Hidden}}).collect())
    })())
}
#[derive(Deserialize)]
struct Update { status: ProjectVisibilityStatus }
async fn update(State(st): State<AppState>, Path(id): Path<String>, Json(req): Json<Update>) -> Response {
    respond((|| -> Result<ProjectVisibility,ApiError> {
        // A start/stop and a visibility mutation cannot interleave. Never stop agents implicitly.
        let _claim=st.try_begin_boot(&id).ok_or_else(||ApiError::conflict("team_starting","Wait for project changes to finish"))?;
        let store=st.store.lock().unwrap();
        if store.draft(&id)?.is_none() {return Err(ApiError::not_found("Project not found"));}
        if matches!(req.status,ProjectVisibilityStatus::Trashed) && store.rig_snapshot(&id)?.is_some_and(|s|s.seats.iter().any(|a|crate::store::is_live(a.lifecycle))) {
            return Err(ApiError::conflict("project_running","Stop the project before moving it to Trash"));
        }
        match req.status {
            ProjectVisibilityStatus::Visible=>{store.connection().execute("DELETE FROM project_visibility WHERE id=?1",[&id])?;},
            _=>{store.connection().execute("INSERT INTO project_visibility(id,status) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET status=excluded.status",rusqlite::params![id,if matches!(req.status,ProjectVisibilityStatus::Hidden){"hidden"}else{"trashed"}])?;}
        }
        Ok(ProjectVisibility{id,status:req.status})
    })())
}
