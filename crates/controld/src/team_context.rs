//! Operator-authored architecture, delivered with work to every team member.
use crate::state::AppState;
use model::{ConnectionKind, TeamDraft};

pub(crate) fn with_context(st: &AppState, seat: &str, text: String) -> String {
    let Some(id) = crate::seat_ids::rig_of(seat) else { return text };
    let text = {
        let store=st.store.lock().unwrap();
        match store.output_limit(id).ok().flatten() {
            Some(limit) => format!("Per-agent budget: {limit} output tokens for this project run, including your managed descendants each with their own {limit}-token budget. This agent has reported {} output tokens. Finish and report well before the limit. Runner stops you and descendants when reported usage reaches the limit; delayed CLI reports can overshoot.\n\n{text}",store.budget_used(seat).ok().flatten().map(|v|v.to_string()).unwrap_or_else(||"unknown".into())),
            None => text,
        }
    };
    let text = if crate::copies::enabled(st, id) {
        format!("You work in your own git copy of the project, on branch {}. Commit your work there. Teammates cannot see your files until the operator merges your branch, so send them what they need (file contents, paths and commits) in messages.\n\n{text}", crate::copies::branch_of(id, seat))
    } else { text };
    let draft = st.store.lock().unwrap().draft(id).ok().flatten();
    let log = draft.as_ref().and_then(|d| decision_log_note(&st.store.lock().unwrap(), id, d.decision_log));
    let text = match log { Some(note) => format!("{note}\n\n{text}"), None => text };
    match draft.and_then(|d| briefing(&d, seat)) {
        Some(context) => format!("{context}\n\n--- Current message ---\n{text}"),
        None => {
            let store=st.store.lock().unwrap();
            let draft=store.draft(id).ok().flatten();
            let mut ancestor=seat.to_string();
            for _ in 0..4 {
                let Some(parent)=store.parent(&ancestor).ok().flatten() else{break};
                if let Some(context)=draft.as_ref().and_then(|d|briefing(d,&parent)) {
                    return format!("{context}\n\nYour active role is managed child agent {seat}; the ancestor role above is architecture context only. Use team_status for current teammates.\n\n--- Current message ---\n{text}");
                }
                ancestor=parent;
            }
            text
        },
    }
}

/// One line telling agents the team keeps a decision log, when it is on and has entries.
pub(crate) fn decision_log_note(store: &crate::store::Store, team: &str, on: bool) -> Option<String> {
    let n = store.decision_count(team).ok().filter(|n| on && *n > 0)?;
    Some(format!("The team keeps a decision log ({n} {}); read it with read_decisions before deciding something it may cover.", if n == 1 { "entry" } else { "entries" }))
}

pub(crate) fn briefing(d: &TeamDraft, seat: &str) -> Option<String> {
    let me = d.agent_for_seat(seat)?;
    // Practice messages are executable fixture commands, not model prompts.
    if me.kind == model::AgentKind::Practice { return None; }
    let mut lines = vec![format!("Team architecture (operator configuration): {}\nYour role: {} [{}]", d.name, me.name, me.id)];
    if let Some(w) = &d.workflow {
        lines.push(format!("This project uses a dynamic workflow, not ordinary turn-end handoffs. Only agent {} calls dispatch_work(batch_id, summary, tasks:[{{id,title,context,mode,depends_on}}]) once per project start. It chooses N within 1–{}. Each task runs stage {} first; stages branch by complete_work outcomes and can loop for at most {} steps. Assembly agent {} waits for every task to complete. Workers receive assignment IDs and must call complete_work(assignment,outcome,result); plain completion replies do not advance the workflow. workflow_status reads the batch. Reserved outcome blocked stops an item. Each topic chooses mode independent with empty depends_on for unrelated work, or dependent with prerequisite topic IDs. Independent topics can run simultaneously on available configured workers; dependent topics wait for accepted results from all prerequisites. Topic dependencies must be acyclic. Reading-order prerequisites alone do not require build dependencies. Use separate module paths; coordinate shared file changes. Use spawn_agent for tracked, bounded helpers when useful. Configured stages: {}", w.dispatcher, w.max_tasks, w.entry, w.max_steps, w.collector, serde_json::to_string(&w.stages).unwrap()));
    }
    lines.push("Work only on your assigned job. A leader plans and coordinates the configured team; it does not replace the other agents or implement their jobs unless explicitly assigned. Sculptured automatically delivers completed replies along 'hands work to' connections. Use spawn_agent to create helpers; all child agents must be managed through this tool so their lifecycle and communication appear on the board. Do not create untracked agents through native CLI delegation, shell processes or external tools. Do not replace configured teammates. Use team_status and send_agent_message to ask teammates for help, request features, report results and coordinate shared interfaces. Include exact artifact revisions and task context. 'Reports to' and 'watches' are descriptive only, not automatic routing. Report missing instructions or blocked dependencies rather than guessing. A reported result is not independently verified.".into());
    lines.push("Use downstream jobs to decide your handoff: when another agent owns implementation, provide its plan and inputs instead of doing that agent's work. Respect project-wide constraints stated in the jobs (such as output folders or no publishing) throughout the team. Ask the operator about conflicting instructions.".into());
    for a in &d.agents {
        let group = d.groups.iter().find(|g| Some(&g.id) == a.group_id.as_ref()).map(|g| g.label.as_str()).unwrap_or("Team");
        lines.push(format!("Agent: {} [{}] · Group: {group} · Folder: {}\nAssigned job: {}", a.name, a.id, d.effective_folder(a).unwrap_or("not configured"), a.job.trim()));
    }
    for c in &d.connections {
        let (Some(from), Some(to)) = (d.agent(&c.from), d.agent(&c.to)) else { continue };
        let kind = match c.kind { ConnectionKind::HandsWorkTo => "hands work to", ConnectionKind::ReportsTo => "reports to (descriptive)", ConnectionKind::Watches => "watches (descriptive)" };
        lines.push(format!("{} [{}] {kind} {} [{}]", from.name, from.id, to.name, to.id));
    }
    Some(lines.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn each_agent_receives_its_own_role_and_the_configured_architecture() {
        let mut d = rigspec::templates::template("builder-reviewer", "project", "My project", false).unwrap();
        d.folder = Some("/home/me/project".into());
        for a in &d.agents {
            let text = briefing(&d, &d.seat_id(&a.id).unwrap()).unwrap();
            assert!(text.contains(&format!("Your role: {} [{}]", a.name, a.id)));
            assert!(text.contains("Builder [builder] hands work to Reviewer [reviewer]"));
            assert!(text.contains("Folder: /home/me/project"));
            assert!(text.contains("Use spawn_agent to create helpers"));
            assert!(text.contains(&a.job));
        }
        assert!(briefing(&d, "missing").is_none());
        d.agents[0].kind = model::AgentKind::Practice;
        assert!(briefing(&d, &d.seat_id(&d.agents[0].id).unwrap()).is_none());
    }
}
