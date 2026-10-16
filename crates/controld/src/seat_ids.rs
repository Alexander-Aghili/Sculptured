//! Seat ids are `{group}.{agent}@{team}`.

/// The team (rig) a seat id belongs to.
pub(crate) fn rig_of(seat: &str) -> Option<&str> {
    seat.rsplit_once('@').map(|(_, rig)| rig)
}

/// `rig_of`, or "" for an id without a team.
pub(crate) fn rig_or_empty(seat: &str) -> &str {
    rig_of(seat).unwrap_or("")
}

/// The team member a seat runs: `pod.member@rig` → `member`.
pub(crate) fn member_of(seat: &str) -> &str {
    let logical = seat.split('@').next().unwrap_or(seat);
    logical.rsplit('.').next().unwrap_or(logical)
}
