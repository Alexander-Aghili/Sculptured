# Protections: a fast rule layer between each agent and its tools

Status: built, 17 October 2026.

## Why

The 16 October C172 run spent 57 M tokens in 80 minutes. 96% of them were cache re-reads of agents' own growing context. Developers on Opus averaged 126k–156k tokens of context per call over about 80 calls each. Where the growth came from: files printed through the shell (31% of all tokens), the agents' own replies (18%) and script output (12%). Claude Code limits how much one Read or one shell command returns, but nothing stops an agent from reading a 400 KB file whole, or from carrying a 150k context through 80 calls. Sonnet is not good enough for the developers' CAD work, so the way to fit more Opus work into a plan window is to make each Opus call smaller.

Protections are rules Sculptured applies between an agent and its tools. The first rules are about efficiency. The same layer is where safety rules go later (none now).

## Goals

- Agents read files in pieces, not whole: a whole-file read of a large file is refused with a reason the agent reads and acts on.
- Shell output that reaches an agent's context is capped well below Claude Code's 30,000-character default.
- An agent's context stays under a ceiling: past it, the agent writes notes and continues in a fresh conversation.
- Every refusal and compaction is recorded as evidence, visible on the agent's page and counted in "Where tokens went".
- It is fast: a rule decision adds a few milliseconds to a tool call, never more than 20 ms.
- One switch per team, on by default, with the thresholds under the team's Advanced settings.
- A place for future safety rules (and MADL's tool rules) without new plumbing.

## Non-goals (now)

- Safety rules. The rule list has room for them; it ships empty.
- Enforcing MADL `restrictions.tools` (allow / deny). Today Sculptured ignores them on import. This layer is where they will be enforced; that is a later change.
- Per-agent thresholds. Team-wide only for now.
- Rewriting tool output after a call (Claude Code's `updatedToolOutput`). The output cap covers the main case.
- Stopping to ask the person. Refusals only explain; an "ask" outcome is for later safety rules.
- Building Sculptured's own harness.

## Anti-goals (a failure even if it technically works)

- An agent stalls or loops because of a rule. Rules fail open: if the guard cannot decide (bad input, unreadable file, any error), the call goes through.
- Tool calls feel slower.
- What happened is hidden: a refusal the person cannot see.
- The person's own Claude Code or Codex settings files are changed. Everything travels with the launch.

## Constraints

- Agents run on the person's computer through their own CLI (Claude Code 2.1.301 and Codex 0.162.1 here), started by the runner (hostd). Runners are not auto-updated: a new runner feature is announced in `HostHello.features`, and controld drops it with a plain-words `FeaturesDropped` note for an older runner, as with `claude-setup`.
- Connected runners refuse `extra_args`; launch options are typed fields (`LaunchParams` in `crates/host-proto/src/lib.rs`).
- Tooling is Rust; no shell or Python scripts (`AGENTS.md`).
- Routine tests make no real model calls (fixture CLIs only).

## How it works

### Rules (decided)

| Rule | Default | Applies to |
|---|---|---|
| Large file read whole | Refuse a read with no line range of a file over **100 KB**. Reason names the file's size and says to search with `grep -n`, then read with offset and limit | Claude `Read`; shell whole-file printers on Claude and Codex |
| Shell output cap | **8,000** characters per command reach the context | Claude (`bashOutputMaxChars`); Codex if it has an equivalent |
| Context ceiling | At **60,000** tokens of context, the agent writes its notes and continues in a fresh conversation | Claude and Codex (Sculptured's own, see below); Claude also gets `--autocompact 100000` as a backstop |

Images, PDFs and notebooks are exempt from the size rule (by file extension, never by reading the file). An image cannot be read in pieces, and Claude Code already requires a page range for long PDFs. Refusing them would make an agent retry forever. (My call, 17 October.)

"Shell whole-file printers": a command whose output is a whole file over the size limit and is not piped into a filter, for example `cat big.csv`, `tac`, `nl`, `less`, `more`, `bat`, `sed -n '1,$p' big.csv`, Windows `type`. `cat big.csv | grep x` passes. Parsing the command is best effort: anything unclear passes (fail open).

### The guard (decided)

- A hidden subcommand of the `sculptured` binary (like `seat-tools`), dispatched in `main()` **before** the tokio runtime and tracing are built, so it starts quickly.
- It reads the hook input JSON on stdin, takes its rules from an environment variable the runner sets on the agent's process (for example `SCULPTURED_PROTECTION`, JSON), and checks only the call itself and file sizes (one `stat`, never file contents).
- To refuse, it prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Sculptured protection: …"}}` and exits 0. To allow, it prints nothing and exits 0. If deny turns out not to be honored under `--dangerously-skip-permissions`, it uses exit code 2 with the reason on stderr instead (documented to block in every case).
- Every reason starts with `Sculptured protection:`; Claude Code puts its own prefix before it, so the runner looks for that phrase inside the error text.
- Speed is tested: a decision, process start included, stays under 20 ms on the CI machine.

### Delivery (decided)

- A new typed team setting `TeamDraft.protection` (on, file size, output cap, context ceiling), carried to the runner as `LaunchParams.protection` behind a new feature flag `protection`, the same path as `claude_setup`. An older runner: launch proceeds without it, with a `FeaturesDropped` note asking to reinstall the runner from Computers.
- Claude: the runner adds `--settings <json>` with a `PreToolUse` hook (matcher `Read|Bash`, command = this runner's own `sculptured` binary path, as already used for `seat-tools`, plus the guard subcommand; `timeout` a few seconds) and `bashOutputMaxChars`, and adds `--autocompact 100000` (the lowest value Claude Code accepts) as a backstop within long turns.

### Context ceiling (decided)

- The Claude parser emits `ContextReported` per model call (input + cache read + cache write), Codex from its token usage. controld sees each agent's context size.
- When an agent's context passes the ceiling, at the end of its current turn controld sends it the existing checkpoint instruction (write `.sculptured/notes/<agent>.md`: done, checks run, next, files) and then restarts it fresh with its job and that note. This reuses `control_agent(.., Checkpoint)` and the budget pause's `restart` (made `pub(crate)`) and `continuation` text. It follows the pattern of `collaboration/token_limits.rs`, which already watches per-agent limits.
- It acts only past twice the conversation's starting size as well, so a fresh conversation (which starts at that size again) can never trip it at once and restart in a loop. The note's turn is the first turn to end after the ceiling is recorded. (Both found in a live run, 17 October.)
- It never interrupts a turn mid-way and never stops the run. The agent's page shows "context 61k of 60k: continuing fresh from notes" as evidence.
- Codex: the same guard as a `PreToolUse` hook through the thread `config` overrides, if Codex's hook trust can be granted to Sculptured's own hook without `--dangerously-bypass-hook-trust` (that flag would also run the person's own untrusted hooks, so it is not used). If it cannot, Codex gets only what Sculptured sets from outside (an output limit and compaction threshold if Codex has them), and the Advanced settings say which protections apply to Codex agents.

### Evidence (decided)

- The Claude parser recognises a tool result starting with `Sculptured protection:` and the runner records a new event, `protection-applied` (rule, tool, a short detail such as the file and its size), on the agent.
- A fresh restart at the ceiling is recorded as an event (`context-ceiling-reached`, with the size), alongside the restart's usual tenure events.
- The Claude parser also emits the existing `ContextReported` event per model call (input + cache read + cache write of that call), so the agent's page can show its context size against the ceiling. Today no driver emits it.
- The agent's conversation shows refusals as a short line ("Sculptured refused reading parts.csv whole: 412 KB"), with the raw event as evidence. "Where tokens went" counts refusals and compactions per agent.

### Settings UI (decided)

Team Advanced, next to the Claude setup switches: a **Protections** section with an on/off switch and the three numbers, in plain words ("Refuse reading a whole file larger than … KB", "Shell output an agent sees: … characters", "Continue an agent fresh from its notes at … tokens of context").

It says per agent kind what actually applies, for example "Codex agents: output cap only". An agent with no protection in effect, whether because of a Codex agent's limits or an older runner, shows "not protected" on its page and in "Where tokens went". That is never the same as "no refusals". (My call, 17 October: the product must not imply control it does not have.)

## Checked in real runs (17 October, Claude Code 2.1.301, Haiku)

1. Hooks passed with `--settings` run with `--setting-sources project,local` and with `--setting-sources ""`, plus `--strict-mcp-config`. ✓
2. A hook's `deny` is honored under `--dangerously-skip-permissions`. ✓ The JSON reply is enough; exit code 2 is not needed.
3. A refused call reaches the agent as a `tool_result` with `is_error: true` and content `PreToolUse:Read hook error: <our reason>`, so the runner looks for `Sculptured protection:` inside the text, not at its start. The final `result` line also lists it in `permission_denials`.
4. `bashOutputMaxChars: 3000` in `--settings` works: a 19.5 KB shell output reached the agent as a saved file path plus a 2 KB preview.
5. `--autocompact` accepts only `auto` or 100k–1M tokens, so a 60k ceiling cannot use it. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is accepted but showed no compaction within one turn at 70k tokens. Hence Sculptured's own ceiling above.

The hook's stdin carried the documented fields (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`, and others).

## Left to the builder

- The exact command parsing for shell whole-file printers, within "best effort, unclear passes".
- How the guard finds the file size for a relative path (the hook input carries `cwd`).
- Names of the event, environment variable, and subcommand.
- Whether Codex has an output limit and compaction threshold, and the Codex hook trust mechanism.
- Test layout, within: unit tests for each rule's decisions, the latency test, the driver's launch arguments, the parser recognising a refusal, controld dropping the setting for an older runner, and the Advanced settings UI.

## Measuring it

Run one C172 subsystem (a developer and a reviewer) before and after, and compare "Where tokens went": tokens per call, re-read share, refusals and compactions. That needs the person's go-ahead, since it uses their plan.
