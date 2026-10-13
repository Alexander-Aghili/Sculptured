//! Checks of an agent's folder that need the filesystem.
use crate::folders::{self, Home};
use crate::state::AppState;
use model::{AgentKind, DraftAgent, DraftIssue, ElementKind, ElementRef, IssueSeverity, TeamDraft};

/// Hosted: a team's folders and agents are on the user's computer, so without that computer connected
/// it can't start. Local `serve` runs everything on this machine and never asks.
pub(crate) fn computer_issue(st: &AppState, d: &TeamDraft) -> Option<DraftIssue> {
    if !matches!(st.auth, crate::auth::AuthPolicy::Gateway { .. }) {
        return None;
    }
    let host = crate::launch::team_host(st, &d.id);
    if st.hosts.is_connected(&host) {
        return None;
    }
    let chosen = st.store.lock().unwrap().team_settings(&d.id).ok().and_then(|t| t.host).filter(|h| !h.is_empty());
    let message = match (chosen, st.hosts.connected().len()) {
        (Some(h), _) => format!("{h} is not connected. Open Computers to reconnect it, or choose another computer for this team."),
        (None, 0) => "Connect your computer: your folders and agents run there, not on the server. Open Computers and choose Connect a computer.".to_string(),
        (None, _) => "Choose which connected computer runs this team (Run on).".to_string(),
    };
    Some(DraftIssue {
        element: ElementRef { kind: ElementKind::Team, id: d.id.clone() },
        severity: IssueSeverity::Error,
        code: "computer-not-connected".to_string(),
        message,
        detail: None,
        spec_path: None,
    })
}

/// Checks that need the filesystem, so they live here and not in `rigspec`. An agent's
/// folder must sit inside the home folder, checked with the folder picker's own rule
/// (`folders::resolve_inside`): a place outside home gets the same words whether or not
/// it exists. A Practice agent without a folder runs in the home folder (`.` in its spec).
pub(crate) fn folder_issues(st: &AppState, d: &TeamDraft) -> Vec<DraftIssue> {
    // Hosted: folders are on the user's computer, whose runner enforces its own allowed folders
    // (`hostd::policy`); the server's home folder says nothing about them.
    if matches!(st.auth, crate::auth::AuthPolicy::Gateway { .. }) {
        return Vec::new();
    }
    let home = folders::home(st).ok();
    d.agents.iter().filter_map(|a| folder_issue(home.as_ref(), a, d.effective_folder(a))).collect()
}

fn agent_issue(a: &DraftAgent, code: &str, message: String, detail: Option<String>) -> DraftIssue {
    DraftIssue {
        element: ElementRef { kind: ElementKind::Agent, id: a.id.clone() },
        severity: IssueSeverity::Error,
        code: code.to_string(),
        message,
        detail,
        spec_path: None,
    }
}

/// A blank or relative folder is `rigspec`'s issue (folder-missing, folder-not-absolute).
fn folder_issue(home: Option<&Home>, a: &DraftAgent, folder: Option<&str>) -> Option<DraftIssue> {
    let who = rigspec::draft::display_name(a);
    match (folder.filter(|f| f.starts_with('/')), home) {
        (Some(_), None) => Some(agent_issue(a, "home-unknown", format!("Your home folder is unknown, so {who}'s folder can't be checked"), None)),
        (Some(f), Some(home)) => {
            let e = folders::resolve_inside(home, std::path::Path::new(f)).err()?;
            Some(match e.code.as_ref() {
                "outside_home" => agent_issue(a, "folder-outside-home", format!("{who}'s folder is outside your home folder"), None),
                "folder_missing" => agent_issue(a, "folder-not-found", format!("{who}'s folder no longer exists: {f}"), None),
                "not_a_folder" => agent_issue(a, "folder-not-a-folder", format!("{who}'s folder is a file, not a folder: {f}"), None),
                "folder_unreadable" => agent_issue(a, "folder-unreadable", format!("Sculptured can't read {who}'s folder: {f}"), None),
                // `.`/`..` components, NUL bytes, link loops, names that are too long.
                _ => agent_issue(a, "folder-bad-path", format!("{who}'s folder path can't be used: {f}"), Some(e.message)),
            })
        }
        (None, None) if a.kind == AgentKind::Practice && folder.is_none() => {
            Some(agent_issue(a, "home-unknown", format!("Your home folder is unknown, so {who} needs a folder"), None))
        }
        (None, _) => None,
    }
}

