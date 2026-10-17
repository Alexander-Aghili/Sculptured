use drivers::claude::ClaudeStreamDriver;
use drivers::{LaunchSpec, SeatToolsLaunch, APPROVE_TOOL};
use model::PermissionPosture;
use serde_json::Value;

fn spec() -> LaunchSpec {
    LaunchSpec::new("dev.a@r".parse().unwrap(), "/tmp".into())
}
fn tools(approve: bool) -> SeatToolsLaunch {
    SeatToolsLaunch {
        program: "/opt/sculptured".into(),
        args: vec!["seat-tools".into()],
        env: vec![("SCULPTURED_SEAT_TOKEN".into(), "tok".into())],
        approve,
        config_file: None,
    }
}
fn after<'a>(a: &'a [String], flag: &str) -> Option<&'a str> {
    a.iter().position(|x| x == flag).map(|i| a[i + 1].as_str())
}

#[test]
fn unrestricted_by_default_skips_permissions() {
    let a = ClaudeStreamDriver::args(&spec(), None, "s1");
    assert!(a.contains(&"--dangerously-skip-permissions".to_string()));
    assert_eq!(after(&a, "--session-id"), Some("s1"));
    assert!(after(&a, "--permission-prompt-tool").is_none());
    assert!(after(&a, "--mcp-config").is_none());
    assert!(after(&a, "--allowedTools").is_none(), "unrestricted already bypasses permissions");
}

#[test]
fn restricted_routes_permission_prompts_to_the_approve_tool() {
    let mut s = spec();
    s.posture = PermissionPosture::Restricted;
    s.seat_tools = Some(tools(true));
    let a = ClaudeStreamDriver::args(&s, Some("old"), "s1");
    assert!(!a.contains(&"--dangerously-skip-permissions".to_string()));
    assert_eq!(after(&a, "--permission-prompt-tool"), Some(APPROVE_TOOL));
    // Sculptured's own tools are pre-allowed, so asking does not raise a second question.
    assert_eq!(after(&a, "--allowedTools"), Some("mcp__rig__request_input,mcp__rig__record_decision,mcp__rig__report,mcp__rig__dispatch_work,mcp__rig__complete_work,mcp__rig__workflow_status,mcp__rig__spawn_agent,mcp__rig__send_agent_message,mcp__rig__team_status,mcp__rig__read_decisions"));
    assert_eq!(after(&a, "--resume"), Some("old"));
}

#[test]
fn restricted_without_seat_tools_names_no_prompt_tool() {
    let mut s = spec();
    s.posture = PermissionPosture::Restricted;
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    assert!(!a.contains(&"--dangerously-skip-permissions".to_string()));
    assert!(after(&a, "--permission-prompt-tool").is_none());
}

#[test]
fn mcp_config_names_the_rig_server() {
    let mut s = spec();
    s.seat_tools = Some(tools(false));
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    let v: Value = serde_json::from_str(after(&a, "--mcp-config").unwrap()).unwrap();
    let rig = &v["mcpServers"]["rig"];
    assert_eq!(rig["type"], "stdio");
    assert_eq!(rig["command"], "/opt/sculptured");
    assert_eq!(rig["args"][0], "seat-tools");
    assert_eq!(rig["env"]["SCULPTURED_SEAT_TOKEN"], "tok");
}

#[test]
fn unrestricted_with_seat_tools_gets_neither_restricted_flag() {
    let mut s = spec();
    s.seat_tools = Some(tools(true));
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    assert!(a.contains(&"--dangerously-skip-permissions".to_string()));
    assert!(after(&a, "--mcp-config").is_some(), "the tools are still offered");
    assert!(after(&a, "--allowedTools").is_none(), "{a:?}");
    assert!(after(&a, "--permission-prompt-tool").is_none(), "{a:?}");
}

#[test]
fn a_config_file_keeps_the_token_off_the_command_line() {
    let mut s = spec();
    let mut t = tools(false);
    t.config_file = Some("/data/host-local/seat-tools/dev.a@r.1234abcd.json".into());
    s.seat_tools = Some(t);
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    assert_eq!(after(&a, "--mcp-config"), Some("/data/host-local/seat-tools/dev.a@r.1234abcd.json"));
    assert!(!a.iter().any(|x| x.contains("tok")), "the token is not in argv: {a:?}");
}

#[test]
fn extra_folders_are_passed_with_add_dir() {
    let mut s = spec();
    s.add_dirs = vec![std::path::PathBuf::from("/x/items")];
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    let i = a.iter().position(|x| x == "--add-dir").expect("--add-dir");
    assert_eq!(a[i + 1], "/x/items");
}

#[test]
fn protections_add_the_guard_hook_the_output_cap_and_a_compaction_backstop() {
    let mut s = spec();
    assert!(after(&ClaudeStreamDriver::args(&s, None, "s1"), "--settings").is_none(), "no protections, no settings");
    s.protection = Some(drivers::ProtectionLaunch { rules: model::GuardRules { max_read_bytes: 102_400, shell_output_chars: 8000, ..Default::default() }, guard: "/opt/My Apps/sculptured".into() });
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    let settings: Value = serde_json::from_str(after(&a, "--settings").expect("--settings")).unwrap();
    assert_eq!(settings["bashOutputMaxChars"], 8000);
    let hook = &settings["hooks"]["PreToolUse"][0];
    assert_eq!(hook["matcher"], "Read|Bash");
    assert_eq!(hook["hooks"][0]["command"], r#""/opt/My Apps/sculptured" guard"#);
    assert_eq!(after(&a, "--autocompact"), Some("100000"));
    let env = ClaudeStreamDriver::protection_env(&s).expect("rules travel in the environment");
    assert_eq!(env.0, "SCULPTURED_PROTECTION");
    assert_eq!(serde_json::from_str::<model::GuardRules>(&env.1).unwrap().max_read_bytes, 102_400);
}

#[test]
fn skills_load_as_a_plugin_folder_and_integrations_as_an_mcp_server() {
    let mut s = spec();
    s.seat_tools = Some(tools(false));
    s.plugin_dirs = vec!["/data/skills/dev.a@r".into()];
    s.mcp_servers = vec![drivers::McpServer { name: "kindex".into(), program: "/home/u/.local/bin/kin-mcp".into(), args: vec![] }];
    let a = ClaudeStreamDriver::args(&s, None, "s1");
    assert_eq!(after(&a, "--plugin-dir"), Some("/data/skills/dev.a@r"));
    let configs: Vec<&String> = a.iter().zip(a.iter().skip(1)).filter(|(f, _)| *f == "--mcp-config").map(|(_, v)| v).collect();
    assert_eq!(configs.len(), 2, "Sculptured's own tools and the integration: {a:?}");
    let extra: Value = serde_json::from_str(configs[1]).unwrap();
    assert_eq!(extra["mcpServers"]["kindex"]["command"], "/home/u/.local/bin/kin-mcp");
}
