# M0 Driver Capabilities (Claude Code 2.1.289, Codex 0.160.0, 2026-10-05)

All evidence is cited as `<recording>@<t_ms>` against `crates/fixtures/recordings/*.jsonl` (scrubbed). Recording lines are `{t_ms, dir: meta|in|out|stderr, line}`. "yes" means a recording shows it. Anything else is `no (not observed)` or `unknown`.

## Caps table
| Capability | ClaudeStreamDriver | CodexAppServerDriver | Evidence |
|---|---|---|---|
| interrupt | yes (observed after `tool_use` is emitted and before the tool executes: the tool is rejected; process survives; same session). Interrupting a running tool, and interrupting during thinking: unobserved (the mid-thinking recording was superseded and is not committed) | yes (mid-command; thread survives) | Claude: claude-interrupt@2342 (tool_use Bash `seq 1 120`, no tool_result yet), request@2342 (same ms as the tool_use), control_response@2355, synthetic is_error tool_result@2431 (`tool_result_meta` `non_execution_kind:"user-rejected"`, so the Bash command never ran), `result` error_during_execution@2434, next turn "alive" in@2435, init@2444, success@3096. The earlier thinking-phase interrupt run was superseded by the fix round and its recording is not committed, so interrupt during thinking is unobserved here. Codex: codex-interrupt `turn/interrupt`@4623, `{}` response@4634, `turn/completed` status `interrupted`@4634, second turn completed@6346. Effect on the running OS process after a Codex interrupt: unknown (not checked). |
| questions | unknown (not probed) | yes, but only with `--enable default_mode_request_user_input` | Claude: no AskUserQuestion probe was run, and the permission probe showed no control_request on stdout (claude-permission). Codex: `item/tool/requestUserInput`@4820 in codex-user-input.jsonl (flag on). With no flag, codex-user-input-noflag.jsonl has zero such requests; the model asked in plain text and the turn never completed (meta timeouts at 240179 and 480179). |
| resume | yes | yes | Claude: claude-resume-1 (`--session-id`) and claude-resume-2 (`--resume`) carry the same session_id 6b0c1f5e-...2a01; result "PLUM-42"@2135 in resume-2. Codex: codex-resume-2 `thread/resume`@89, recalled "PEAR-9"@3740, `turn/completed` completed@3782 (new process). |
| fork | unknown (not probed) | yes (thread level; the fork's behaviour is unobserved) | Claude: no recording uses `--fork-session` or any fork flag. Codex: codex-fork `thread/fork`@3193 in, response@3281 with a new thread id and `forkedFromId` = source id; `thread/started` for the fork@3281. No turn was run on the fork, so recall is not observed. |
| usage | yes (per message on `assistant`; `result.usage` is the main thread only and excludes subagent usage; `modelUsage` and `total_cost_usd` are session-cumulative; see Claude facts) | yes (`thread/tokenUsage/updated`) | Claude: claude-basic result@1595 has `usage.input_tokens 2, output_tokens 4, cache_read_input_tokens 10225, cache_creation_input_tokens 14338`; assistant@1582 carries `message.usage`. Interrupted result@2434 in claude-interrupt also has `usage`. Subagent exclusion: claude-subagent result@10782 `usage` is 4/484/36490/17984 (in/out/cache-read/cache-write) while `modelUsage` sums to 8/943/56502/40601. Codex: codex-tool@4529 and @5871 (`tokenUsage.{last,total,modelContextWindow}`). |
| mid_turn_input | no (queue only) | yes (`turn/steer`) | Claude: claude-queue sends two user lines at t=0. The second is replayed@3166 only after the first turn's `result`@2136 and a new init@2143. It runs as its own turn, so it is queued, not injected. Codex: codex-steer `turn/steer`@3631, response same turnId@3635, final agentMessage "steered"@24737, one turn, status completed@24808. The 20 s `sleep` was not aborted. |
| subagent_events | yes | no (not observed) | Claude: claude-subagent tool_use `Agent`@3265, `system/task_started`@3272, child lines carry `parent_tool_use_id` (user@3277, assistant@4897, tool_result@4935), `task_progress`@4891, `task_updated` and `task_notification`@8261, parent tool_result@8264. Codex: no recording exercises subagents or collab items. |

## Claude stream-json facts
- Unrestricted posture flag that worked: `--dangerously-skip-permissions`. `system/init` then shows `permissionMode:"bypassPermissions"` (see the init line in claude-basic@531; the flag appears in the `meta` args line of claude-basic@0). A run without it shows `permissionMode:"default"` (claude-permission@1104).
- `system/init` before first user message: **no**. claude-init.jsonl holds only 4 hook system lines (@473-474), a 5 s meta timeout@5000 and the exit. In every other recording init comes after the user line has been sent (claude-basic@531, claude-interrupt@583). **init is emitted at the start of every turn**: claude-queue@927 and @2143, claude-interrupt@583 and @2444. Hook `system` lines (`hook_started`, `hook_response`) arrive before any user message. `SessionReady` at spawn with our own id is correct. With `--session-id` the id is ours. With `--resume` the same id came back (claude-resume-2@562).
- Replayed operator message shape: top-level `"isReplay": true` on a `type:"user"` line with `message.content:[{type:"text",text}]` and `parent_tool_use_id:null` (claude-basic@1579). **A replay is not recognisable as "a user line with no tool_result"**, because other non-replay `user` lines have no tool_result either:
  - the interrupt marker `[Request interrupted by user for tool use]` (claude-interrupt@2431, text only, no `isReplay`);
  - the subagent's prompt (claude-subagent@3277, `parent_tool_use_id` set, no `isReplay`).
  Use `isReplay == true` AND `parent_tool_use_id == null`.
- Queued messages: replayed separately and in order (claude-queue "one"@2125, "two"@3166). Two `result` lines (@2136, @3522) with `result_index` 0 and 1. The second replay is not emitted until the first turn is done.
- Usage: both. `assistant.message.usage` per API message (note: several `assistant` lines can share one `message.id`, one content block per line, so do not sum across assistant lines) and `result.usage` with `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` (plus extra keys such as `cache_creation`, `fallback_credit`, `inference_geo`, `iterations`). `result` also has `modelUsage` (camelCase), `total_cost_usd`, `num_turns`, `result_index`.
  - **`result.usage` covers the main thread only and excludes subagent usage.** claude-subagent@10782: `usage` = input 4 / output 484 / cache-read 36490 / cache-write 17984, but `modelUsage` sums to inputTokens 8 / outputTokens 943 / cacheRead 56502 / cacheCreation 40601.
  - **`modelUsage` and `total_cost_usd` are cumulative across the session, including across `--resume`.** claude-queue: result@2136 modelUsage out 3, cost 0.1369; result@3522 modelUsage out 51 (usage.output_tokens 48), cost 0.1465. claude-interrupt: @2434 out 128; @3096 out 132 (usage.output_tokens 4). claude-resume-1@4349 out 121; claude-resume-2@2135 out 129 (usage.output_tokens 8).
  - Options for per-turn accounting (not chosen here; the M1 plan decides): (a) a `modelUsage` delta between consecutive results (includes subagents; the first result after `--resume` in a new process has no baseline); (b) `result.usage` plus separately accumulated subagent usage (from `task_progress`/`task_notification` `usage`).
- Interrupt: request line `{"type":"control_request","request_id":"probe-int-1","request":{"subtype":"interrupt"}}`. Response line `{"type":"control_response","response":{"request_id":"probe-int-1","response":{"still_queued":[]},"subtype":"success"}}`. Note the nested `response.response`. Then, in order (claude-interrupt@2431-2434): a `user` tool_result with `is_error:true` (synthetic, text "The user doesn't want to proceed..."), a `user` text line `[Request interrupted by user for tool use]`, and `result` with `subtype:"error_during_execution"`, `is_error:true`, `stop_reason:"tool_use"`, `terminal_reason:"aborted_tools"`, `errors:["[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use"]` (the string does not mention abort). The observed abort signal is `terminal_reason == "aborted_tools"`. Process survives and the same session continues (@2435-3096). For an interrupt during thinking, the marker text, `stop_reason` and `terminal_reason` are unknown (that recording was superseded and is not committed).
- Subagent linkage field: `parent_tool_use_id` on child `user` and `assistant` lines equals the parent's `Agent` tool_use id. The wire tool name is `Agent` (claude-subagent@3265), though init's tool list still says `Task`. Extra `system` lines: `task_started`, `task_progress`, `task_updated`, `task_notification`, each with `task_id` and `tool_use_id`. All claude-subagent lines carry the same `session_id`; child lines are linked only by `parent_tool_use_id`.
- Other line types seen (not in M1's assumed set): `system/hook_started`, `system/hook_response` (SessionStart only, once per process, before the first user message: claude-queue@837, claude-interrupt@510; not repeated per turn), `system/thinking_tokens` (claude-subagent@9415), `rate_limit_event` (claude-basic@1589), `assistant` with a `thinking` block (empty text plus signature), and the top-level `tool_use_result` on tool_result lines.
- Permission-prompt tool request shape (from spikes/m0/sandbox/mcp-approve.log, a scratch file that is not committed; key lines inlined below): MCP `tools/call` with `name:"approve"` and `arguments:{tool_name, input, tool_use_id}` plus `_meta.claudecode/toolUseId`. Claude first sends `server/discover`, `initialize`, `notifications/initialized` and `tools/list`. The gate was honoured: `probe.txt` exists, `approve invoked: 1`. The permission prompt is NOT on stream-json stdout (claude-permission shows init@1104 default mode, tool_use Write@2922, tool_result@2943, no control_request). Deny path: not tested.
  - Inlined, scrubbed: `{"method":"tools/call","params":{"name":"approve","arguments":{"tool_name":"Write","input":{"file_path":"<sandbox>/probe.txt","content":"hi"},"tool_use_id":"toolu_..."},"_meta":{"claudecode/toolUseId":"toolu_...","progressToken":2}},"jsonrpc":"2.0","id":2}`, and the probe printed `probe.txt exists: true`, `approve invoked: 1`, `tool_name requested: "Write"`.

## Codex app-server facts
- Parameter renames versus the M0 probe code: `turn/steer` takes `expectedTurnId` (not `turnId`), params `{threadId, expectedTurnId, input}` (codex-steer@3631). Everything else matched: `clientInfo`, `threadId`, `input`, `cwd`, `approvalPolicy`, `sandbox`, `turn/interrupt {threadId, turnId}`. No JSON-RPC errors in any run.
- Exact params that worked:
  - `initialize {"clientInfo":{"name":"sculptured-probe","version":"0.0.0"}}`, then notification `{"method":"initialized"}` (codex-basic@0).
  - `thread/start {"cwd":...,"approvalPolicy":"never","sandbox":"danger-full-access"}` (@96).
  - `turn/start {"threadId":T,"input":[{"type":"text","text":"..."}]}` (@1538).
  - Our requests carry `"jsonrpc":"2.0"`. Server responses and notifications omit it.
  - `approvalPolicy` takes `untrusted|on-request|never`; `sandbox` takes `read-only|workspace-write|danger-full-access` (from the generated app-server schema in docs/spikes/codex-app-server-schema-0.160.0).
- Thread/turn id locations: `thread/start` response `/result/thread/id`; `turn/start` response `/result/turn/id` (status `inProgress`); notification `turn/started` `params.turn.id`; `thread/started` `params.thread.id`; `turn/completed` `params.turn.{id,status,durationMs,error}`. Statuses seen: `completed`, `interrupted`.
- Usage notification and fields: `thread/tokenUsage/updated`, `params:{threadId, turnId, tokenUsage:{last, total, modelContextWindow}}`. `last` and `total` each have `{cacheWriteInputTokens, cachedInputTokens, inputTokens, outputTokens, reasoningOutputTokens, totalTokens}`. `total` is cumulative for the thread, `last` is the latest model call. Per-turn usage is therefore a delta of `total` (codex-tool@4529 total 17966, @5871 total 36018). `account/rateLimits/updated` is separate. **After resume or fork the first `tokenUsage` is a replay of old usage:** codex-resume-2@190 re-emits the previous turn's usage (total 17907) before any new turn; codex-fork@3281 emits `tokenUsage` for the NEW thread carrying the parent's turnId and total (17906).
- Interrupt and steer: interrupt returns `{}` and a `turn/completed` with status `interrupted`, and the thread accepts a new turn (codex-interrupt@4634, @6346). Wait for an `item/started` with `item.type == "commandExecution"` before interrupting. A bare `item/started` matches the userMessage item first. Steer returns the same `turnId` and keeps the turn, and does not abort a running command (codex-steer@3635, @24737, @24808). Unobserved: whether the command process was killed after interrupt, and whether steer cancels it.
- requestUserInput: observed only with `codex app-server --enable default_mode_request_user_input` (codex-user-input@4820). Without it, the model asks in plain text and the turn hangs on `sleep` items and never completes (codex-user-input-noflag, 480 s). The flag is "under development" per `codex features list`, so a driver must not assume it exists. Request: `{id, method:"item/tool/requestUserInput", params:{questions:[{id,header,question,options:[{label,description}],isOther,isSecret}], itemId, threadId, turnId, isBlocking, autoResolutionMs}}`. Answer: `{"id":<same>,"result":{"answers":{"<question id>":{"answers":["green"]}}}}`. The server then sends `serverRequest/resolved {requestId}` (@4821).
- Approval request method, params, response shape: `item/fileChange/requestApproval` (not a command approval) with `{itemId, threadId, turnId, grantRoot, reason, startedAtMs}`, answered `{"id":<same>,"result":{"decision":"accept"}}` (codex-approval@4805). Then `serverRequest/resolved`, `item/completed` of the fileChange item (diff `hi\n`, kind add), `turn/completed` completed@6770. Other schema decisions: `acceptForSession`, `decline`. Not observed: `item/commandExecution/requestApproval`, and any decline path.
- Fork / resume behaviour: `thread/fork {threadId}` returns a new `thread.id` with `thread.forkedFromId`. **The response has `sandbox` `workspaceWrite` (with `networkAccess:false`) and `approvalPolicy` `never`, even though the source thread was started with `danger-full-access`** (codex-fork@3281). Pass `sandbox` (and `approvalPolicy`) explicitly on fork. `thread/resume {threadId}` in a new process restored context (PEAR-9 recalled), and the response has `thread, model, cwd, sandbox, approvalPolicy, collaborationMode`. Resume re-sending sandbox settings was not tested. Not observed: a turn on a fork recalling the parent's context.
- stderr: codex-interrupt@6349 has two `dir:"stderr"` ERROR lines, `codex_core::session: failed to record rollout items: thread 01a10ddc-... not found`, right after the post-interrupt turn completed. Relevant to M2 resume-after-interrupt: the interrupted thread's rollout may not be fully persisted; resume of an interrupted thread was not tested.
- Other notification types observed (all codex recordings): `hook/started`, `hook/completed`, `warning`, `deprecationNotice`, `mcpServer/startupStatus/updated`, `remoteControl/status/changed`, `account/updated`, `account/rateLimits/updated`, `thread/goal/cleared`, `thread/status/changed`, `turn/diff/updated`, `item/commandExecution/outputDelta`, `serverRequest/resolved`. Server-initiated request ids start at 0 in every recording (a separate id space from ours).
- Scrub note. Redacted: `$HOME` and the username (`/home/user`, `user`); hook output fields (`<redacted hook output>`); `planType` and `authMode`; `credits.balance` and `credits.hasCredits`; `messaging_socket_path`; `installationId` (remoteControl/status/changed); Claude `rate_limit_info.overageDisabledReason` and `utilization`; the OS/terminal part of Codex `userAgent` (client name/version kept). Kept as non-secret: plugin/skill/MCP server names, model names, session/thread ids, `usedPercent` and `resetsAt`, `codexHome` (now `/home/user/.codex`). Protocol structure is unchanged.
- Not observed for Codex: subagent events, command-execution approval, decline/deny, rate-limit behaviour beyond the notification, `thread/fork` recall, process-level effect of interrupt.

## Consequences for M1/M2
M1 Task 4 (fake claude):
- Change the replay marker handling: keep `isReplay: true` on the replayed user line, and also emit `parent_tool_use_id: null`, `uuid`, `timestamp`. Add fake lines that are non-replay user lines with no tool_result (interrupt marker text, subagent prompt with `parent_tool_use_id`), so the parser's replay test is exercised.
- Change init: the fake must NOT emit `system/init` at start. Emit it only after receiving a user line, and again at the start of each turn, preceded by `hook_started`/`hook_response` system lines at startup. Test that SessionReady does not wait for init.
- Change `result.usage` keys: current names (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) are correct. Also add `message.usage` on assistant lines so double counting is tested, and the interrupted `result` should carry `usage` too.
- Change the interrupt flow in `hang`: the fake must emit a `tool_use` first, then on `control_request` emit `control_response` shaped `{"type":"control_response","response":{"request_id":<id>,"response":{"still_queued":[]},"subtype":"success"}}` (nested `response.response`), then a synthetic `user` tool_result with `is_error:true`, then a `user` text line `[Request interrupted by user for tool use]` (no `isReplay`), then `result` with `subtype:"error_during_execution"`, `is_error:true`, `stop_reason:"tool_use"`, `terminal_reason:"aborted_tools"`. Use `[Request interrupted by user]` and no tool_result for an interrupt during text/thinking.
- Change the `subagent` tool name from `Task` to `Agent` (and init `tools` may keep `Task`). Child lines keep `parent_tool_use_id`. Add `system/task_started`, `task_progress`, `task_updated` and `task_notification` lines, and a child `user` prompt line with `parent_tool_use_id` and no `isReplay`.
- Add to the fake: `rate_limit_event`, `system/thinking_tokens`, and an `assistant` thinking block (`thinking:""` plus `signature`), including two `assistant` lines sharing one `message.id`.
- Queue: replay of message N+1 must be emitted only after message N's `result` and a new init, and there is one `result` per message. Add a `queue` behaviour if the driver test needs it.
- Flag: `--dangerously-skip-permissions` is confirmed. No change.
- Add a golden-test scenario: a second message queued BEFORE the interrupt marker or the subagent prompt line is emitted, and assert `MessageConsumed{m2}` lands on turn-2 (not consumed by the marker or the child prompt). Without it, the replay rule is not regression-tested.

M1 Task 5 (ClaudeParser and ClaudeStreamDriver):
- Change replay detection from "user line with no tool_result blocks" to `isReplay == true && parent_tool_use_id == null`. Otherwise the interrupt marker (claude-interrupt@2431) and the subagent prompt (claude-subagent@3277) would be taken as replays, popping `pending` and calling `ensure_turn`. A non-replay user line with no tool_result should be ignored, not consume a message. It must be ignored: an Unrecognized event would fail `no_unrecognized_core_types`.
- Change the final `_ => Unrecognized` arm and the `system` arm: handle `system` subtypes explicitly. Ignore `hook_started`, `hook_response`, `thinking_tokens`, `init` and `rate_limit_event` (top-level type). Map `task_started`, `task_progress`, `task_updated` and `task_notification` to subagent events or ignore them deliberately. Leave Unrecognized for the truly unknown. Add the real subtype names to the recordings tests: `no_unrecognized_core_types` only checks assistant/user/result, so it will pass while flooding Unrecognized.
- Change the interrupt `tool_result`: the synthetic `is_error` tool_result at claude-interrupt@2431 yields a `ToolResult` with `is_error:true` for the interrupted call. This is intended (it closes the call). The `[Request interrupted...]` user text line must not become a MessageConsumed.
- Interrupt ordering (golden test, from claude-interrupt@2342-2434). The parser must produce, in this order: (1) `control_response` (@2355) produces no event; (2) the synthetic `is_error:true` tool_result (@2431) produces `ToolResult{is_error:true}` for the interrupted call; (3) the `[Request interrupted by user for tool use]` user line (@2431, no `isReplay`) produces nothing and must NOT be treated as a replay; (4) `result` subtype `error_during_execution` (@2434) produces `TurnEnded{Interrupted}` when an interrupt was requested. `ToolResult` comes BEFORE `TurnEnded`. `on_interrupt` with no current turn is a no-op (nothing to interrupt, flag stays unset). Then the next turn must report Completed (@3096).
- Interrupted status: keep `interrupt_requested -> Interrupted`, and also map `result.subtype == "error_during_execution"` with `terminal_reason`/`errors` showing an abort to Interrupted when no request is pending. Real interrupted result: `subtype:"error_during_execution"`, `is_error:true`, `stop_reason:"tool_use"`, `terminal_reason:"aborted_tools"` (use `terminal_reason == "aborted_tools"` as the abort signal; the `errors` string does not say abort). The `Failed` fallback for other error subtypes stays.
- Change Usage emission: `result.usage` is a turn total, so keep emitting from `result`. Do not also read `assistant.message.usage`. The `cache_creation_input_tokens` mapping is correct. BUT `result.usage` excludes subagent usage and `modelUsage` is session-cumulative (see Claude facts), so "turn total" means main-thread only. The controller chooses the per-turn rule in the M1 plan (modelUsage delta, or `result.usage` plus subagent usage). Once chosen, the golden test must assert subagent-inclusive usage on claude-subagent.
- Change the `ControlResponse`: it is ignored, so the real nested shape needs no code change. A failing `control_response` (subtype other than success) is unobserved. Keep `still_queued` for later.
- Change Caps: `fork` from `true` to `false` (or unknown) until a `--fork-session` probe exists. `questions` is unknown (not probed); keep it false in the driver until probed. `mid_turn_input=false` matches the observed queueing. `interrupt, resume, usage, subagent_events = true` are evidenced.
- Subagent: the parser records the tool name without matching on it, so `Agent` needs no code change, but `ClaudeParser` tests and any name-based logic must accept both `Agent` and `Task`. Task 7 (hostd mapping) has a test at plan line ~4402 using `"Task"` as the subagent call name. Change it to cover `Agent`.
- SessionReady at spawn: keep. Real init arrives only after the first user message, so readiness cannot wait for init. Optionally compare init's `session_id` with ours. Init repeats every turn, so it must remain ignored.
- Recording tests: `replay()` counts `in` user lines to register message ids. claude-queue has two `in` user lines at t=0. That works. For claude-interrupt, `on_interrupt` is called when the `in` control_request is seen. The recording has the interrupt after the tool_use, so `current_turn` is set. OK.
- Big or interleaved lines: tool_result text in `tool_use_result.stdout` duplicates `content`. Use `message.content` only.
- Resume: `--resume <id>` returned the same session id. The `--session-id` and `--resume` flags are not combined. This matches `args()`.
- Permission prompt (M1/M2 scope): the Claude permission gate runs through an MCP tool not stream-json control requests. M1 does not use it (unrestricted default). Deny path unprobed.

M2 (CodexAppServerDriver):
- Use the exact params above. Use `expectedTurnId` for `turn/steer`. Start with `codex app-server --enable default_mode_request_user_input` only when questions are wanted, and treat `questions` as capability-gated.
- Usage: derive per-turn usage from `thread/tokenUsage/updated` `total` deltas (or `last` per model call). Treat the first `tokenUsage` after `thread/resume` or `thread/fork` as a baseline, not as usage (resume-2@190 and fork@3281 replay old totals).
- Interrupt then resume: the stderr rollout ERRORs (codex-interrupt@6349) mean resume-after-interrupt is untested; probe it before relying on it.
- Approval: answer `item/fileChange/requestApproval` with `{decision:"accept"}`. Loop over all approvals until `turn/completed`. Command approval is unobserved.
- Fork: pass `sandbox` and `approvalPolicy` explicitly on `thread/fork` (default observed `workspaceWrite`).
- Interrupt: wait for `item/started` with `item.type == "commandExecution"`. Unknown whether the process dies.
- Unknown or unobserved: subagents, deny path, fork recall.

## Codex 0.160.1 refresh (M2)

Recorded 2026-10-07 with `codex-cli 0.160.1` by `crates/fixtures/src/bin/codex-probe.rs` (Rust; hand-run only, never in a routine test), in a throwaway cwd (scrubbed to `/tmp/codex-probe`). Evidence is cited as `<recording>@<t_ms>` against `crates/fixtures/recordings/codex-m2-*.jsonl`. The `*.mcp-stub.jsonl` files are the MCP stub's own log (`crates/fixtures/src/bin/mcp-ping-stub.rs`, one tool `ping`), in the same line format. The first `meta` line now also carries `version`. The M0 recordings are unchanged; the M2 ones sit beside them.

Real model use: 8 app-server sessions with turns, 9 turns in all (basic 1, tool 1, approval 1, user-input 1, interrupt 2, resume 1, seat-config-dotted 1, seat-cli 1). Four more sessions made no model call (`limits`, `mcp-config-dotted`, `mcp-config-nested`, `mcp-cli`: initialize, `thread/start` or `account/rateLimits/read`, `mcpServerStatus/list`, close).

### What changed since 0.160.0
- **Nothing in the protocol.** `codex app-server generate-json-schema` output for 0.160.1 is byte-identical to `docs/spikes/codex-app-server-schema-0.160.0/` (every JSON file and the v1/v2 bundles; the `ts/` folder was not regenerated). No new schema folder is committed.
- **Recorded shapes match.** For basic and tool, the set of (method, item type, `params` keys, `item` keys, `turn` keys, `tokenUsage.total` keys) is identical to codex-basic and codex-tool. The basic and tool event order matches too: `thread/started`, `turn/started`, hooks, `userMessage`, `agentMessage`, `thread/tokenUsage/updated` + `account/rateLimits/updated`, `turn/completed` (codex-m2-basic@417-4202, codex-m2-tool@223-8343). requestUserInput, the interrupt flow, the `thread/resume` response and the replayed first `tokenUsage` after resume also match M0.
- New details seen (in the schema already, first time recorded):
  - `thread/status/changed` carries `status.activeFlags: ["waitingOnApproval"]` while an approval is open (codex-m2-approval@4646, cleared @4648).
  - `commandExecution` items carry `source` (`agent`, `unifiedExecStartup`) and `processId`, which is a string (codex-m2-approval@8596).
  - `aggregatedOutput` is `null`, not `""`, on a completed command with no output (codex-m2-approval@8596, `exitCode` 0) and on a declined one (@4648).
  - `agentMessage` items have `phase: "commentary" | "final_answer"`.
  - The requestUserInput question id is chosen by the model (`preferred_color`, codex-m2-user-input@6167), as in M0.
- `thread/resume` sends `deprecationNotice` "Full-history hydration is deprecated for paginated threads; use `excludeTurns: true`, then page with `thread/turns/list` and `thread/items/list`." (codex-m2-resume@113). `ThreadResumeParams.excludeTurns` is in the schema.
- User-specific noise: every thread sends a `warning` about the user's hooks being loaded from two files (scrubbed paths). This is not protocol; a driver must not depend on it.

### Earlier guesses, now confirmed or refuted
| Plan line | Guess | Result |
|---|---|---|
| 3300 (Task 11) | "The real server probably steers the active turn" when `turn/start` arrives mid-turn | **Confirmed.** A `turn/start` sent while `sleep 97` ran answered at once with the *active* turn's id, `status: "inProgress"`, `items: []` and `itemsView: "notLoaded"`. There was no error, no new turn and no `turn/started` (codex-m2-interrupt@6654-6656). The steered text then got no `userMessage` item. The turn was interrupted 20 ms later, and that text was lost: the resumed thread recalled only `KIWI-3`, not `LIME-5` (codex-m2-resume@4280). fake-codex's `-32600 a turn is already in progress` is a deliberate divergence from the real server (it makes a driver bug visible). The driver's queueing (plan 4896) is required: a mid-turn `turn/start` would merge two messages into one turn. |
| 4893 (Task 13 posture) | Restricted = `approvalPolicy: "untrusted"` + `sandbox: "danger-full-access"` asks before acting | **Confirmed for commands.** The model created a file through a shell command (not `fileChange`), and both commands asked through `item/commandExecution/requestApproval` (codex-m2-approval@4647, @8562). The plan must handle both approval kinds (it does); fake-codex's `edit:` only exercises `fileChange`. |
| 4893 (Task 13 posture) | Passing `sandbox` and `approvalPolicy` on `thread/resume` keeps them | **Confirmed for resume.** The response has `sandbox: {type: "dangerFullAccess"}` and `approvalPolicy: "never"` (codex-m2-resume@232, meta @232). Fork was not re-probed. |
| 4894 and 6113-6165 (Task 13, Step 12) | Seat tools reach Codex through thread `config` with dotted keys `mcp_servers.rig.{command,args,env,tool_timeout_sec}` | **Confirmed with the stub** (not the real `sculptured seat-tools` shim). The primary route works end to end; so do fallback 1 (nested) and fallback 2 (`-c`). See "Seat tools: the route that works". |
| 4898 (Task 13 stop) | "whether the real server exits on EOF is unobserved" | **Refuted (it is observed).** Every recording, M0 and M2, shows `exit: 0` about 250 ms after stdin closes (codex-m2-basic@6202 → @6453; codex-m2-interrupt@12990 → @13240). The process-group kill after the grace period stays as a backstop. |
| 4041 (Task 12 tools) | `mcpToolCall` → `mcp__<server>__<tool>` with `arguments`, result from `result.content[].text`, else `error.message` | **Confirmed.** `item/started` then `item/completed` with `{server:"rig", tool:"ping", arguments:{message:"probe"}, status:"completed", error:null, result:{content:[{type:"text", text:"pong: probe"}], structuredContent:null, _meta:null}, durationMs:1}`, id `exec-…` (codex-m2-seat-config-dotted@7399-7401; codex-m2-seat-cli@7333-7335). |
| 4041 (Task 12 tools) | `commandExecution` is an error when `status` is not `completed` | **Confirmed.** A declined command completes with `status: "declined"`, `exitCode: null`, `aggregatedOutput: null` (codex-m2-approval@4648). |
| 4044-4045 (Task 12 questions and answers) | `item/commandExecution/requestApproval`, answered `{"decision": "accept"\|"decline"}`; the parser reads `commandActions[0].command`, `command`, `cwd`, `reason` | **Confirmed, first observation.** Params: `{availableDecisions, command, commandActions:[{command,type}], cwd, environmentId, itemId, kind:"command", proposedExecpolicyAmendment, startedAtMs, threadId, turnId}`. There is no `reason` key (the parser's `p["reason"]` is null). `{"decision":"decline"}` worked: `serverRequest/resolved`, the item `declined`, the turn went on and completed, and the final text said the step was skipped (@4647-@10919). One stderr line follows a decline: `ERROR codex_core::tools::router: … Rejected("rejected by user")` (@4648). **Note:** `availableDecisions` listed `["accept", {acceptWithExecpolicyAmendment…}, "cancel"]` and did *not* list `decline`, yet `decline` was honoured. Per the schema, `cancel` also interrupts the turn; `decline` continues it. |
| 4043 (Task 12 turn end); 4332, 4725 | Limit endings arrive as `turn.error.codexErrorInfo` `usageLimitExceeded` / `rateLimitExceeded` | **Unobserved; schema unchanged.** See "Usage and rate limits". |
| 4046 (Task 12 unknown input) | Unknown server requests such as `mcpServer/elicitation/request` are refused | Not exercised. **No elicitation or approval was asked for the MCP tool call under `approvalPolicy: "never"`.** Under `untrusted` it is unknown (not probed). |
| 4043 (`mcpServer/startupStatus/updated`) | Fields `name`, `status`; `failed` marks the seat tools as not started | Field names **confirmed**: `{name, status, error, failureReason, threadId}`, with `starting` then `ready` right after the `thread/start` response (codex-m2-mcp-config-dotted@279). A second `ready` for `rig` came during the turn (codex-m2-seat-config-dotted@2203). The `failed` status itself is unobserved. |

### Seat tools: the route that works
All three routes started the server, listed its tool, and passed both `args` and `env` to the process. In every stub log, the meta line shows the `--log` arg and `env_RIG_PROBE_TOKEN_present: true`. Codex then sent `initialize` (`clientInfo.name: "codex-mcp-client"`, `protocolVersion: "2025-06-18"`, `capabilities.elicitation`), `notifications/initialized` and `tools/list`. `mcpServerStatus/list {threadId, serverName:"rig", detail:"toolsAndAuthOnly"}` returned the `ping` tool (no model call).

1. **Thread `config`, dotted keys: the plan's primary route. It works, including a model turn.** Exact params:
   ```json
   {"method":"thread/start","params":{"cwd":"…","approvalPolicy":"never","sandbox":"danger-full-access",
     "config":{"mcp_servers.rig.command":"<abs path>/mcp-ping-stub",
               "mcp_servers.rig.args":["--log","<path>"],
               "mcp_servers.rig.env":{"RIG_PROBE_TOKEN":"tok"},
               "mcp_servers.rig.tool_timeout_sec":86700}}}
   ```
   The model called `ping` and replied `ready` (codex-m2-seat-config-dotted@7399-8922). Codex's `tools/call` to the server carries `_meta` with `callId` (the item id), `threadId`, `progressToken` and `x-codex-turn-metadata` (model, sandbox, turn id) (codex-m2-seat-config-dotted.mcp-stub).
2. **Thread `config`, nested (fallback 1).** `{"config":{"mcp_servers":{"rig":{"command":…,"args":[…],"env":{…},"tool_timeout_sec":86700}}}}`: the server started and listed `ping` (codex-m2-mcp-config-nested@209). No model turn was spent on it.
3. **`-c` overrides (fallback 2), in the plan's `mcp_overrides` format.** `codex app-server -c mcp_servers.rig.command="<path>" -c mcp_servers.rig.args=["--log", "<path>"] -c 'mcp_servers.rig.env={ RIG_PROBE_TOKEN = "tok" }' -c mcp_servers.rig.tool_timeout_sec=86700`, then a plain `thread/start`. It works, including a model turn (codex-m2-seat-cli@212-8835).

`tool_timeout_sec = 86700` was accepted with no `warning`/`configWarning` on any route. Whether Codex honours it (waits 24 h on a blocked call) is unknown.

### Interrupt, process and resume
- **The interrupted command keeps running.** `sleep 97` was alive before the interrupt, and still alive 2 s after `turn/completed: interrupted` (codex-m2-interrupt meta @6654 count 1, @8681 count 1). It was gone once app-server exited after stdin closed. That last check is from the probe's console output, not the recording. The interrupted `commandExecution` never gets `item/completed`, as in M0. So Task 12's `TOOL_UNFINISHED` is right that no result came, but an interrupted Codex agent may leave a command running until the app-server process ends. The driver's process-group kill on stop ends it.
- After the interrupt, a duplicate `thread/tokenUsage/updated` (same `total` as before) arrived, so the delta is 0 (@6663).
- **Resume after interrupt works** in a new process. The same stderr `failed to record rollout items: thread … not found` ERROR appeared at exit (codex-m2-interrupt@13009), as in M0. The resumed thread listed both turns (`interrupted`, `completed`) and recalled `KIWI-3` from the interrupted turn (codex-m2-resume@232, @4280). The first `tokenUsage` after resume replays the old total with the previous turn's id (@232), as in M0.

### Usage and rate limits (no limit was provoked)
- **Observed.** `account/rateLimits/updated` `{rateLimits:{credits:{balance,hasCredits}, limitId:"codex", planType, primary:{usedPercent, resetsAt, windowDurationMins}}}` follows each `thread/tokenUsage/updated` (codex-m2-basic@4178). It is sparse: the schema says to merge it into the last `account/rateLimits/read`.
- `account/rateLimits/read` (params `null`, no model call) answers `{accountId, ordinaryUsageAllowed, rateLimitResetCredits, rateLimitUpsell, rateLimits:<RateLimitSnapshot>, rateLimitsByLimitId:{codex:<RateLimitSnapshot>}}` (codex-m2-limits@1257). `RateLimitSnapshot` = `{credits, individualLimit, limitId, limitName, normalModelSlug, planType, primary, secondary, rateLimitReachedType, spendControlReached}`. All numbers and account values are redacted.
- **Limit-error shape, from the schema only (UNOBSERVED).**
  - A limit ends a turn as `turn/completed` with `turn.status: "failed"` and `turn.error: TurnError = {message: string, codexErrorInfo: CodexErrorInfo|null, additionalDetails: string|null, misalignment: …|null}`.
  - `CodexErrorInfo` is either a string or a single-key object. Strings: `contextWindowExceeded`, `sessionBudgetExceeded`, `usageLimitExceeded`, `rateLimitExceeded`, `flexUnavailable`, `serverOverloaded`, `cyberPolicy`, `misalignmentPolicyViolation`, `tooManyDenials`, `internalServerError`, `unauthorized`, `badRequest`, `threadRollbackFailed`, `sandboxError`, `other`. Objects: `{httpConnectionFailed:{httpStatusCode}}`, `{responseStreamConnectionFailed:{…}}`, `{responseStreamDisconnected:{…}}`, `{responseTooManyFailedAttempts:{…}}`, `{activeTurnNotSteerable:{turnKind}}`.
  - The `error` notification is `{error: TurnError, threadId, turnId, willRetry: bool}`.
  - `RateLimitSnapshot.rateLimitReachedType` is one of `rate_limit_reached`, `workspace_owner_credits_depleted`, `workspace_member_credits_depleted`, `workspace_owner_usage_limit_reached`, `workspace_member_usage_limit_reached`.
  - So a parser matching on `codexErrorInfo.as_str()` handles the two limit strings. An object variant falls through to a plain `Failed`. `sessionBudgetExceeded` is a further string the plan does not map.

### Remaining unknowns
- Any real limit ending: the actual `message` text, whether an `error` notification precedes it, and whether `rateLimitReachedType` is set.
- The MCP tool approval path for a restricted (`untrusted`) Codex agent: whether `mcpServer/elicitation/request` or an approval request is raised for `mcp__rig__*` calls.
- Whether `tool_timeout_sec` is honoured, and the failed `mcpServer/startupStatus/updated` shape.
- The real `sculptured seat-tools` shim through Codex: only the stub was used.
- Fork: recall, and whether explicit sandbox/approval on `thread/fork` is honoured (resume only was re-probed). `fileChange` decline. `acceptForSession`. `cancel`.
- Whether the steered text of a mid-turn `turn/start` reaches the model when the turn is *not* interrupted (M0's codex-steer says yes for `turn/steer`).

### Scrub note (M2)
`codex-probe scrub` replaced the following before commit:
- **Paths and names.** `$HOME` became `/home/user` (190 strings). The throwaway cwd became `/tmp/codex-probe`, and the raw output dir became `/tmp/codex-probe/out`. The login name and the host name (they are the same word, case-insensitively) became `user` (12, e.g. `remoteControl` `serverName`).
- **Redacted to `"<redacted>"`.** `accountId` (1), `authMode` (9), `planType` (29), `credits.balance`, `hasCredits` and `unlimited` (20 each), `installationId` (12), `ordinaryUsageAllowed` (1), `rateLimitResetCredits` (1), `spendControlReached` (2), every `usedPercent`, `resetsAt` and `windowDurationMins` (20 each), and the probe's `RIG_PROBE_TOKEN` value (3).
- **userAgent.** The OS part of `userAgent` became `<redacted>` (12).
- **Nothing found.** No email matched; no hook output was non-empty.

Afterwards, a grep for the login name, the host name, `@…com`, `/home/alex`, the scratch path, and every redacted key holding a non-redacted value came back clean. Kept on purpose: thread, turn and item ids; the model name; and plugin and MCP server names. Numeric fields that were redacted are now strings, so read them as data, not as typed values.

## M2 probe: Codex seat tools via thread config

Run once on 2026-10-07 with `codex-cli 0.160.1` (Task 13 Step 12, the one user-approved real Codex probe; two tiny model turns). **Pass, on the primary route: no fallback is needed.** The real `CodexAppServerDriver` started the real `sculptured seat-tools` shim (Task 6) through the thread `config` as dotted keys, on `thread/start` and again on `thread/resume`.

How it ran (`real_codex_probe` in `crates/fixtures/tests/codex_contract.rs`):
- The driver's program was `codex-probe app-server` (a recording pass-through to `codex app-server`), so the recordings hold exactly the driver's own lines.
- The shim's socket was a test socket that stands in for hostd. It recorded each call and answered like controld: `request_input` → `{"text":"Blue","question_id":"probe-q1","timed_out":false}`, `report` → `{"text":"Recorded your report."}`. No hostd or controld ran.
- Posture: unrestricted (`approvalPolicy: "never"`, `sandbox: "danger-full-access"`).
- Turn 1 used a fresh thread (`thread/start`). Turn 2 resumed the same thread (`thread/resume`) in a new process, with a **new** seat token, as a relaunch mints one.
- Throwaway cwd.

Recordings (scrubbed): `crates/fixtures/recordings/codex-m2-seat-shim.jsonl`, `codex-m2-seat-shim-resume.jsonl`, and the socket's own log `codex-m2-seat-shim.seat-socket.jsonl`. They are replayed by `the_real_seat_tools_shim_is_called_through_thread_config` and by the no-unrecognized check in `crates/drivers/tests/codex_recordings.rs`.

### Startup
`rig` reported `starting`, then `ready`, with `error: null`, on both `thread/start` (codex-m2-seat-shim@2081) and `thread/resume` (codex-m2-seat-shim-resume@246-247). A second `ready` came during each turn (@2919, @1030), as with the stub in the refresh.

**No failed `mcpServer/startupStatus/updated` for `rig`** appeared, and the parser kept no `Unrecognized` with `"name": "rig"`. stderr was empty in both sessions.

### Turn 1 (`thread/start`)
The prompt was: `Call the tool request_input of the MCP server rig once, with question "Which colour?" and options ["Blue", "Green"]. Then reply with exactly the answer the tool returned, nothing else.`

Driver events, verbatim (warnings and usage omitted):
- `ToolCall { name: "mcp__rig__request_input", input: {"options": ["Blue", "Green"], "question": "Which colour?"} }`
- `ToolResult { output: "Blue", is_error: false }`
- `Text { text: "Blue" }`
- `TurnEnded { status: Completed }`

Codex's item for the call was `{server:"rig", tool:"request_input", status:"completed", result.content:[{type:"text", text:"Blue"}], error:null, durationMs:4}` (codex-m2-seat-shim@8237-8243).

The socket received `{"tool":"request_input","args":{"options":["Blue","Green"],"question":"Which colour?"}}` with the first token. **The answer reached Codex:** it was the tool result, and the agent's reply.

### Turn 2 (`thread/resume`, fresh token)
The prompt was: `Call the tool report of the MCP server rig once with summary "probe", then reply with exactly the word: ready`.

Driver events, verbatim:
- `ToolCall { name: "mcp__rig__report", input: {"summary": "probe"} }`
- `ToolResult { output: "Recorded your report.", is_error: false }`
- `Text { text: "ready" }`
- `TurnEnded { status: Completed }`

The socket received `report` with the **second** token: the resumed thread used the config of the resume request, not the old one.

The replayed `tokenUsage` after the resume was taken as the baseline: no extra `Usage` event at turn start.

### Approvals, tools and timeout
- Neither MCP call raised a server request (no `mcpServer/elicitation/request`, no approval) under `never`.
- The tool list itself was not asked for (the driver does not call `mcpServerStatus/list`). Codex calling `request_input` and `report` by name shows it saw them.
- `tool_timeout_sec: 86700` was accepted with no `configWarning`. Whether Codex waits that long on a blocked call is still unknown.

### Does Codex persist the seat token?
Checked by reading `~/.codex` only, with no further calls and nothing written. The check covered every file there changed during the probe (50 files). Each was searched for both token values, the env name `SCULPTURED_SEAT_TOKEN`, the key `mcp_servers.rig`, and the thread id.

Files that hold the thread id (so the thread itself is persisted):
- `~/.codex/sessions/2026/10/07/rollout-2026-10-07T23-05-39-<thread id>.jsonl` (the session rollout, 83 KB)
- `~/.codex/thread_history_1.sqlite` and its `-wal`
- `~/.codex/state_5.sqlite-wal`

**None of the 50 files contains either seat token, the env name, or the `mcp_servers.rig` key.** The other changed files were `logs_2.sqlite` and its `-wal`, sqlite `-shm` files, `models_cache.json`, the `cache/codex_apps_*` files, plugin cache files and `tmp/arg0` locks.

The thread `config`, with the token in `mcp_servers.rig.env`, therefore was not written to `~/.codex` in plain bytes in 0.160.1. Two limits:
- A plain byte search would miss compressed or encoded storage.
- The token lives only while its agent's process runs.

### Still unverified for Codex seat tools
- after `thread/fork`;
- under the restricted posture (`untrusted`: whether Codex asks before an MCP call);
- through the real hostd and controld relay (the probe's socket stood in for hostd);
- a question that waits longer than Codex's default MCP tool timeout (whether `tool_timeout_sec` is honoured).

### Scrub note (Step 12)
`codex-probe scrub` was run as in the refresh, with the probe's `/tmp` root as the cwd root. It replaced the following:
- `$HOME` → `/home/user` (41);
- the `/tmp` root → `/tmp/codex-probe` (17);
- the login/host name → `user` (2).

It redacted these keys:
- `SCULPTURED_SEAT_TOKEN` (2) and the socket log's `token` (2);
- `authMode` (2), `planType` (8), `installationId` (2);
- `balance`, `hasCredits` and `unlimited` (6 each);
- `usedPercent`, `resetsAt` and `windowDurationMins` (6 each);
- the `userAgent` OS part (2).

Afterwards, a grep of the three files came back clean for all of these:
- the login name, the host name, `@gmail`, any `x@y.tld` address and `/home/alex`;
- the scratch path and the `/tmp` root;
- the token prefixes `probe-a-` and `probe-b-`;
- every redacted key holding a non-redacted value.

The probe's console output was not committed: it holds the unscrubbed hooks `warning` path.

## M2 probe: reasoning summaries (`model_reasoning_summary = "auto"`)

Run once on 2026-10-07 with `codex-cli 0.160.1`, as one extra tiny turn the user approved within the Step 12 probe (for the thinking-capture lane). It was run with `codex-probe run reasoning-summary`, in a throwaway cwd. Recording (scrubbed as above): `crates/fixtures/recordings/codex-m2-reasoning-summary.jsonl`.

**Route.** `model_reasoning_summary` is a config key (`ConfigReadResponse`), so it went in the thread `config`: `thread/start {"approvalPolicy":"never","sandbox":"danger-full-access","config":{"model_reasoning_summary":"auto"}}`.
- It was accepted with no `configWarning`. The only `warning` was the user's hooks note, as in every recording.
- The schema's other route, `TurnStartParams.summary` ("Override the reasoning summary for this turn and subsequent turns", enum `auto|concise|detailed|none`), was not tried.
- The model was `gpt-6-astra`, with `reasoningEffort: "high"` (the thread/start answer). The prompt was "Think it through briefly, then reply with only the number: what is 17 times 23?", and the answer was "391".

**Result: yes, a non-empty summary was emitted.** One `reasoning` item, in this order:
1. `item/started` @4392: `{"type":"reasoning","id":"rs_…","summary":[],"content":[]}`. **There is no summary text when it starts.**
2. `item/reasoning/summaryPartAdded` @6400: `{"itemId":"rs_…","summaryIndex":0,"threadId":…,"turnId":…}`. It opens summary part 0 and carries no text.
3. `item/reasoning/summaryTextDelta` @6400: `{"delta":"**Finding number 391**","itemId":"rs_…","summaryIndex":0,"threadId":…,"turnId":…}`. **The delta carries the text.** Here it was one delta holding the whole part; longer summaries may split.
4. `item/completed` @6410: `{"type":"reasoning","id":"rs_…","summary":["**Finding number 391**"],"content":[]}`. **The completed item carries the full summary**, one string per part, in markdown.

Other details:
- `content` (the raw reasoning text) stayed empty, and no `item/reasoning/textDelta` came.
- `tokenUsage.total.reasoningOutputTokens` was 9.

**Without the setting**, none of `codex-m2-basic`, `codex-m2-tool`, `codex-m2-seat-shim` or `codex-m2-seat-shim-resume` has a `reasoning` item or any `item/reasoning/*` line.

**The parser today (unchanged, as asked):**
- It keeps no reasoning text: `reasoning` is a quiet item, so `item/completed`'s `summary` is dropped.
- `summaryTextDelta` is dropped, like every delta.
- `item/reasoning/summaryPartAdded` is in neither `IGNORED` nor the delta rule, so it would become an `Unrecognized` event. For that reason this recording is not in the parser's replay list.
- A thinking lane would read `summary` from `item/completed` (complete) or join the `summaryTextDelta`s per `summaryIndex` (live). Either way it would add `summaryPartAdded` to the ignored lines.
