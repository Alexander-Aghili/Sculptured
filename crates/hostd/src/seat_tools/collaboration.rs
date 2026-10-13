use serde_json::{Value, json};
pub fn tools() -> Vec<Value> {
    vec![
        json!({"name":"spawn_agent","description":"Create a managed child agent, visible on the live board and stopped with its parent. Inherits this agent's model, folder and permissions. Use for bounded, independent help; do not replace configured teammates. Reuse request_id for retries. Limit 10 direct children per agent, 64 total agents, depth 4.","inputSchema":{"type":"object","properties":{"request_id":{"type":"string"},"name":{"type":"string"},"task":{"type":"string"}},"required":["request_id","name","task"]}}),
        json!({"name":"send_agent_message","description":"Message another agent in this project, including engine feature/support requests and subagent results. It is queued if busy; does not interrupt. Use team_status for exact recipient IDs. Include context, artifact revision, desired response and your own ID. Reuse request_id for retries.","inputSchema":{"type":"object","properties":{"request_id":{"type":"string"},"to":{"type":"string"},"text":{"type":"string"}},"required":["request_id","to","text"]}}),
        json!({"name":"team_status","description":"Read current project agents, parent relationships, activity, lifecycle and stop controls. An idle open session is not active work.","inputSchema":{"type":"object","properties":{}}}),
    ]
}
