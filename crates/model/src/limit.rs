//! A turn that ended because the provider's usage or rate limit was hit. Sculptured never retries it
//! by itself (a retry spends the user's money); the operator sends "continue" once the limit resets.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum LimitKind {
    /// The plan's allowance (Claude "session limit", "usage limit", "weekly limit"; Codex `usageLimitExceeded`).
    Usage,
    /// A rate limit (Claude "rate limit"; Codex `rateLimitExceeded`).
    Rate,
}

/// The longest reset text kept; anything longer is not a time.
pub const MAX_RESETS: usize = 40;

/// The reset time as the CLI wrote it, if it wrote one: the words after "resets " (or "try again at "),
/// up to an opening parenthesis, a full stop, a middle dot or the end of the line. Never guessed:
/// "You've hit your session limit · resets 4:30am (America/New_York)" → "4:30am"; no such words → None.
pub fn limit_resets(text: &str) -> Option<String> {
    // ASCII lowering keeps every byte offset, so an index into `lower` is an index into `text`.
    let lower = text.to_ascii_lowercase();
    let start = ["resets ", "try again at "].iter().find_map(|k| lower.find(k).map(|i| i + k.len()))?;
    let rest = &text[start..];
    let end = rest.find(['(', '.', '·', '\n']).unwrap_or(rest.len());
    let t = rest[..end].trim();
    (!t.is_empty() && t.len() <= MAX_RESETS).then(|| t.to_string())
}

/// One window of a subscription plan's allowance, as the CLI reported it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct PlanWindow {
    /// `five_hour`, `seven_day`, or `<n>_minutes` for another length.
    pub name: String,
    /// Percent of the window used, 0–100 (it can pass 100). None when the CLI did not say.
    #[ts(type = "number | null")]
    pub used_percent: Option<f64>,
    /// When the window resets, Unix seconds.
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
}

/// A CLI's report of how much of the signed-in plan is used. Account-wide: it counts use from
/// outside Sculptured too.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct PlanUsage {
    /// `claude` or `codex`.
    pub provider: String,
    pub windows: Vec<PlanWindow>,
    /// The CLI's status word, verbatim (Claude `allowed`, `allowed_warning`, `rejected`; Codex the
    /// limit it reached), if any.
    pub status: Option<String>,
    /// Codex: the credit balance, verbatim, when the plan has credits that use past the limit spends.
    pub credits: Option<String>,
}

fn window_name(minutes: Option<u64>) -> String {
    match minutes {
        Some(300) => "five_hour".into(),
        Some(10080) => "seven_day".into(),
        Some(n) => format!("{n}_minutes"),
        None => "window".into(),
    }
}

impl PlanUsage {
    /// Codex rate limits: the app-server's `account/rateLimits/updated` params.rateLimits (camelCase)
    /// or a session file's `rate_limits` (snake_case). None when it names no window.
    pub fn from_codex(v: &serde_json::Value) -> Option<Self> {
        let pick = |o: &serde_json::Value, a: &str, b: &str| if o[a].is_null() { o[b].clone() } else { o[a].clone() };
        let windows: Vec<PlanWindow> = ["primary", "secondary"]
            .iter()
            .filter_map(|k| {
                let w = &v[*k];
                w.is_object().then(|| PlanWindow {
                    name: window_name(pick(w, "windowDurationMins", "window_minutes").as_u64()),
                    used_percent: pick(w, "usedPercent", "used_percent").as_f64(),
                    resets_at: pick(w, "resetsAt", "resets_at").as_i64(),
                })
            })
            .collect();
        if windows.is_empty() {
            return None;
        }
        let credits = pick(v, "credits", "credits");
        let has = pick(&credits, "hasCredits", "has_credits").as_bool() == Some(true);
        Some(Self {
            provider: "codex".into(),
            windows,
            status: pick(v, "rateLimitReachedType", "rate_limit_reached_type").as_str().map(str::to_string),
            credits: has.then(|| credits["balance"].as_str().map(str::to_string)).flatten(),
        })
    }

    /// Claude's stream-json `rate_limit_info`. Its `unifiedWindows` utilization is a fraction (1.0 = all
    /// used). None when it names no window.
    pub fn from_claude(info: &serde_json::Value) -> Option<Self> {
        let mut windows: Vec<PlanWindow> = info["unifiedWindows"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(name, w)| PlanWindow {
                name: name.clone(),
                used_percent: w["utilization"].as_f64().map(|u| (u * 1000.0).round() / 10.0),
                resets_at: w["resetsAt"].as_i64(),
            })
            .collect();
        if windows.is_empty() {
            if let Some(name) = info["rateLimitType"].as_str() {
                windows.push(PlanWindow { name: name.into(), used_percent: None, resets_at: info["resetsAt"].as_i64() });
            }
        }
        if windows.is_empty() {
            return None;
        }
        windows.sort_by(|a, b| a.name.cmp(&b.name));
        Some(Self { provider: "claude".into(), windows, status: info["status"].as_str().map(str::to_string), credits: None })
    }

    /// The fullest window that has not reset by `now_s`, if any reports a percent.
    pub fn fullest(&self, now_s: i64) -> Option<&PlanWindow> {
        self.windows
            .iter()
            .filter(|w| w.used_percent.is_some() && w.resets_at.is_none_or(|r| r > now_s))
            .max_by(|a, b| a.used_percent.partial_cmp(&b.used_percent).unwrap_or(std::cmp::Ordering::Equal))
    }
}

#[cfg(test)]
mod plan_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_codex_in_both_spellings_and_claude_fractions() {
        let app = json!({"primary":{"resetsAt":1791580416,"usedPercent":31,"windowDurationMins":10080},"secondary":null,
            "credits":{"balance":"12.5","hasCredits":true},"rateLimitReachedType":null});
        let file = json!({"primary":{"used_percent":100.0,"window_minutes":10080,"resets_at":1792298156},"secondary":null,
            "credits":{"has_credits":true,"balance":"40465.98"}});
        let a = PlanUsage::from_codex(&app).unwrap();
        assert_eq!((a.windows[0].name.as_str(), a.windows[0].used_percent, a.credits.as_deref()), ("seven_day", Some(31.0), Some("12.5")));
        let f = PlanUsage::from_codex(&file).unwrap();
        assert_eq!(f.fullest(0).unwrap().used_percent, Some(100.0));
        assert!(f.fullest(1792298156).is_none(), "a window that has reset says nothing");
        let c = PlanUsage::from_claude(&json!({"status":"allowed","unifiedWindows":{
            "seven_day":{"resetsAt":9,"utilization":0.61},"five_hour":{"resetsAt":8,"utilization":0.425}}})).unwrap();
        assert_eq!(c.windows.iter().map(|w| (w.name.as_str(), w.used_percent)).collect::<Vec<_>>(),
            vec![("five_hour", Some(42.5)), ("seven_day", Some(61.0))]);
        assert!(PlanUsage::from_codex(&json!({})).is_none());
    }
}
