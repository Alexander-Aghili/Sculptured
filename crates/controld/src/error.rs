use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use model::DraftIssue;
use rigspec::Diagnostic;
use serde_json::json;

/// Error envelope for every API response: `{"error": {"code", "message", "diagnostics"?, "issues"?}}`.
#[derive(Clone, Debug, PartialEq)]
pub struct ApiError {
    pub status: StatusCode,
    /// Usually a constant; a connected computer's answer carries its own code (`From<LocalError>`).
    pub code: std::borrow::Cow<'static, str>,
    pub message: String,
    pub diagnostics: Option<Vec<Diagnostic>>,
    pub issues: Option<Vec<DraftIssue>>,
    /// What a tool answered when it could not be used, shown to the user as evidence.
    pub raw: Option<String>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self { status, code: std::borrow::Cow::Borrowed(code), message: message.into(), diagnostics: None, issues: None, raw: None }
    }
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", message)
    }
    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }
    pub fn bad_gateway(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, code, message)
    }
    pub fn unprocessable(code: &'static str, message: impl Into<String>, diagnostics: Vec<Diagnostic>) -> Self {
        Self { diagnostics: Some(diagnostics), ..Self::new(StatusCode::UNPROCESSABLE_ENTITY, code, message) }
    }
    /// 422 for a team that cannot start: the plain-language issues travel in `error.issues`.
    pub fn invalid_team(issues: Vec<DraftIssue>) -> Self {
        let n = issues.iter().filter(|i| i.severity == model::IssueSeverity::Error).count();
        let message = format!("{n} {} to fix", if n == 1 { "thing" } else { "things" });
        Self { issues: Some(issues), ..Self::new(StatusCode::UNPROCESSABLE_ENTITY, "team_invalid", message) }
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", message)
    }

    pub fn body(&self) -> serde_json::Value {
        let mut e = json!({ "code": self.code, "message": self.message });
        if let Some(d) = &self.diagnostics {
            e["diagnostics"] = serde_json::to_value(d).expect("diagnostics serialize");
        }
        if let Some(i) = &self.issues {
            e["issues"] = serde_json::to_value(i).expect("issues serialize");
        }
        if let Some(r) = &self.raw {
            e["raw"] = json!(r);
        }
        json!({ "error": e })
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body())).into_response()
    }
}

impl From<localops::LocalError> for ApiError {
    fn from(e: localops::LocalError) -> Self {
        let status = StatusCode::from_u16(e.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        Self { status, code: std::borrow::Cow::Owned(e.code), message: e.message, diagnostics: None, issues: None, raw: None }
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        Self::internal(format!("store error: {e}"))
    }
}

/// A JSON body, or the error's own response.
pub(crate) fn respond<T: serde::Serialize>(r: Result<T, ApiError>) -> Response {
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

/// `v` as JSON for an idempotent request's stored receipt.
pub(crate) fn to_value<T: serde::Serialize>(v: T) -> Result<serde_json::Value, ApiError> {
    serde_json::to_value(v).map_err(|e| ApiError::internal(e.to_string()))
}
