use std::path::PathBuf;

/// Scrubbed real protocol recordings from the M0 spike.
pub fn recordings_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("recordings")
}

/// Fixture commands live in the work message; architecture is context for a real model.
pub fn work_message(text: &str) -> String {
    let mut out = text.to_string();
    while let Some(start) = out.find("Team architecture (operator configuration):") {
        let Some(end) = out[start..].find("\n\n--- Current message ---\n") else { break };
        out.replace_range(start..start + end + "\n\n--- Current message ---\n".len(), "");
    }
    out
}
