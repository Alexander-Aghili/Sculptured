//! Settings: global (D7 posture, D8 timeout) and per team. Task 4 adds the HTTP routes.
use crate::state::AppState;
use crate::store::Store;
use crate::views::{Settings, TeamSettings};
use axum::Router;
use rusqlite::{Connection, OptionalExtension, params};

const GLOBAL: &str = "global";
const OVERRIDE: &str = "override:question_timeout_ms";

fn team_key(team: &str) -> String {
    format!("team:{team}")
}

fn read<T: serde::de::DeserializeOwned + Default>(conn: &Connection, key: &str) -> rusqlite::Result<T> {
    let json: Option<String> = conn
        .query_row("SELECT json FROM settings WHERE k = ?1", [key], |r| r.get(0))
        .optional()?;
    Ok(json.and_then(|j| serde_json::from_str(&j).ok()).unwrap_or_default())
}

fn write<T: serde::Serialize>(conn: &Connection, key: &str, v: &T) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (k, json) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET json = excluded.json",
        params![key, serde_json::to_string(v).expect("settings serialize")],
    )?;
    Ok(())
}

pub(crate) fn settings_in(conn: &Connection) -> rusqlite::Result<Settings> {
    read(conn, GLOBAL)
}

pub(crate) fn team_settings_in(conn: &Connection, team: &str) -> rusqlite::Result<TeamSettings> {
    read(conn, &team_key(team))
}

/// A team's question timeout: the test override, else the team's minutes, else the global minutes.
pub fn question_timeout_ms_in(conn: &Connection, rig: &str) -> rusqlite::Result<u64> {
    if let Some(ms) = read::<Option<u64>>(conn, OVERRIDE)? {
        return Ok(ms);
    }
    let minutes = team_settings_in(conn, rig)?
        .question_timeout_min
        .unwrap_or(settings_in(conn)?.question_timeout_min);
    Ok(u64::from(minutes.max(1)) * 60_000)
}

impl Store {
    pub fn settings(&self) -> rusqlite::Result<Settings> {
        settings_in(self.connection())
    }
    pub fn save_settings(&mut self, s: &Settings) -> rusqlite::Result<()> {
        write(self.connection(), GLOBAL, s)
    }
    pub fn team_settings(&self, team: &str) -> rusqlite::Result<TeamSettings> {
        team_settings_in(self.connection(), team)
    }
    pub fn save_team_settings(&mut self, team: &str, s: &TeamSettings) -> rusqlite::Result<()> {
        write(self.connection(), &team_key(team), s)
    }
    /// `sculptured serve --question-timeout-secs` (tests and e2e only). None removes it.
    pub fn set_question_timeout_override(&mut self, ms: Option<u64>) -> rusqlite::Result<()> {
        match ms {
            Some(ms) => write(self.connection(), OVERRIDE, &Some(ms)),
            None => self
                .connection()
                .execute("DELETE FROM settings WHERE k = ?1", [OVERRIDE])
                .map(|_| ()),
        }
    }
    pub fn question_timeout_ms(&self, rig: &str) -> rusqlite::Result<u64> {
        question_timeout_ms_in(self.connection(), rig)
    }
}

/// Seam (Task 4): `GET/PUT /api/settings`, `GET/PUT /api/teams/{id}/settings`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/settings", axum::routing::get(get_settings).put(put_settings))
        .route(
            "/api/teams/{id}/settings",
            axum::routing::get(get_team_settings).put(put_team_settings),
        )
}
async fn get_team_settings(
    axum::extract::State(st): axum::extract::State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<crate::extract::Json<TeamSettings>, crate::ApiError> {
    Ok(crate::extract::Json(st.store.lock().unwrap().team_settings(&id)?))
}
#[derive(serde::Deserialize)]
struct SaveTeamSettings {
    settings: TeamSettings,
}
/// Applies at each agent's next launch.
async fn put_team_settings(
    axum::extract::State(st): axum::extract::State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    crate::extract::Json(req): crate::extract::Json<SaveTeamSettings>,
) -> Result<crate::extract::Json<TeamSettings>, crate::ApiError> {
    let s = req.settings;
    if s.question_timeout_min.is_some_and(|m| !(1..=1440).contains(&m)) {
        return Err(crate::ApiError::bad_request(
            "settings_invalid",
            "Question timeout must be between 1 and 1440 minutes",
        ));
    }
    let mut store = st.store.lock().unwrap();
    if store.draft(&id)?.is_none() {
        return Err(crate::ApiError::not_found("Project not found"));
    }
    let had_copies = store.team_settings(&id)?.own_copies;
    store.save_team_settings(&id, &s)?;
    drop(store);
    if s.own_copies && !had_copies {
        crate::analytics::emit(&st, "copies.enabled", serde_json::json!({}));
    }
    Ok(crate::extract::Json(s))
}
async fn get_settings(axum::extract::State(st): axum::extract::State<AppState>) -> Result<crate::extract::Json<Settings>, crate::ApiError> {
    Ok(crate::extract::Json(st.store.lock().unwrap().settings()?))
}
#[derive(serde::Deserialize)]
struct SaveSettings {
    settings: Settings,
}
async fn put_settings(
    axum::extract::State(st): axum::extract::State<AppState>,
    crate::extract::Json(req): crate::extract::Json<SaveSettings>,
) -> Result<crate::extract::Json<Settings>, crate::ApiError> {
    let s = req.settings;
    if s.community_url.as_ref().is_some_and(|u| {
        u.len() > 300 || !(u.starts_with("https://") || u.starts_with("http://localhost:") || u.starts_with("http://127.0.0.1:"))
    }) {
        return Err(crate::ApiError::bad_request("settings_invalid", "Use an HTTPS community URL"));
    }
    if !(1..=1440).contains(&s.question_timeout_min) {
        return Err(crate::ApiError::bad_request(
            "settings_invalid",
            "Question timeout must be between 1 and 1440 minutes",
        ));
    }
    st.store.lock().unwrap().save_settings(&s)?;
    Ok(crate::extract::Json(s))
}
