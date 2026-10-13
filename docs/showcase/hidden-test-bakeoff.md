# Showcase: the Hidden-Test Bake-off

**Status:** run 1 recorded on 2026-10-12, Claude Opus vs Claude Sonnet (Codex was at its weekly limit). The results and findings are below. Re-run as Claude vs Codex after Codex resets.

## The pitch

Two AI builders, one Claude Code and one Codex, race to build the same small library from a spec. Each works in its own isolated copy of the repo. An examiner wrote acceptance tests the builders never see. Sculptured runs those tests itself and marks results **verified**, not "the agent said done". A judge compares the two and merges the winner. You can watch it all from your phone while the agents run on your laptop, and send the whole run to someone else to replay.

## Why it shows what Sculptured is

| A single prompt / vibe coding | n8n-style workflows | Sculptured |
|---|---|---|
| One agent, one attempt, "done" taken on trust | Fixed pipelines of API calls; no autonomous coding in real repos | A *team* of autonomous coding agents, each with its own tools, working in real repos on your machine |
| No isolation: one working copy | n/a | **Own copies**: each builder gets its own git worktree and branch, so the builders can't interfere |
| Proof is whatever the agent writes | Step outputs | **Checks** that Sculptured runs itself, shown as *verified*, with the test output as evidence |
| Linear chat | A static graph | A live, visual team: **who hands work to whom**, start order, status, questions you answer mid-run |
| Hard to share or audit | Logs | A **run file** that anyone can import and replay in History: every handoff, check and token count |
| Your machine only | Server-side | **Hosted control of local agents**: run on your laptop, watch and answer from any device |

## Setup

1. **A tiny repo.** A target with a short spec in `SPEC.md`, for example:
   - a token-bucket **rate limiter** library;
   - a **Markdown → slides** CLI.
2. **Describe it** (*Start from…* → Describe it):
   > Two builders race to implement the library in SPEC.md from a spec; an examiner first writes hidden acceptance tests; a judge compares both and merges the winner.

   Options: shape "builders with reviewers", agent kinds "mixed", 3 alternatives. Pick the one that matches, or trim it to this:
   - **Examiner** (Claude) → hands work to → **Claude Builder** and **Codex Builder** → both hand work to → **Judge**.
3. **The examiner's job.** Write acceptance tests from SPEC.md into `~/bakeoff/hidden/`, which is **outside** the repo, plus a runner `~/bakeoff/hidden/run.mjs <folder>` that exits 0 only when everything passes. Never put the tests in the repo.
4. **The builders' jobs.** Implement SPEC.md in this repo. Each builder's **check** is `node ~/bakeoff/hidden/run.mjs .`
5. **Team settings:**
   - **Own copies** on;
   - the computer **sandboxed** (`sculptured connect … --sandboxed --enable checks`), so builders can't write outside their copy; checks still run because they're enabled by name.
6. **The judge's job.** Compare both branches and their check history (Copies panel, History). Pick the winner on passing tests first, then on simplicity, and explain why.

## The demo, beat by beat

1. **Start the team.** The examiner starts first, because "hands work to" sets the start order. The board shows the builders waiting.
2. **The examiner hands off,** and both builders start in parallel, each in its own copy.
3. **Watch the checks flip from red to green** per builder. Each result is labelled *verified*, with output you can open.
4. **Show it from a phone (hosted).** Same live board. Answer a question an agent asks.
5. **The judge decides.** Click **Merge** on the winner's copy, and show the diff.
6. **Download run.** Import it into another account and replay the race in History.

## What to capture

- A screen recording of the real app only. Don't use mocked or illustrated screens (AGENTS.md).
- Token use per agent (budget view), with estimates labelled as estimates.
- The run file itself, as a downloadable artifact next to the video.

## Prerequisites

- Claude Code and Codex signed in on the computer that runs the team.
- The hosted beta up (M6) for the phone part. Locally, the same demo runs on a single machine.
- A real check of Codex structured output has not been done yet. It doesn't matter here, because generation can use Claude.


## Run 1 (2026-10-12): results

- **Setup:** the main build (000538d) on a separate local instance. The team was made with *Describe it* (Claude Code), set up in Design, and started from the UI.
- **Recording:** a real headless-Chrome screen capture of the app, made from every frame Chrome painted. Setup and wrap-up play at 2× speed, the agents' 26 minutes as a ×20 time-lapse, and each stretch is labelled on screen. The video (3:31) is at `~/bakeoff/bakeoff-recording.mp4`. The run file (`rate-limiter-bake-off-run-1.sculptured-session.jsonl`, 287 KB) was downloaded from History.
- **Outcome:**
  - both builders passed 64/64 hidden tests, verified by Sculptured's own check runs;
  - the Judge picked **Opus Builder** on diff size (114 lines against 121);
  - I merged its copy from the Git page, and merged `main` also passes 64/64 when I run the tests myself;
  - neither builder touched the hidden folder except to run `run.mjs` (from the captured tool calls).
- **Agent-reported tokens** (cache reads not included): Examiner 42.7k out, Opus 9.5k, Sonnet 4.6k, Judge 5.1k. The Judge's single turn showed 229k including cache reads.

## Findings from run 1


## Describe it (generator)
1. **Good:** the questions step (10 s) asked four relevant questions; three alternatives in 68 s; one in 27 s. The Thorough option proposed an "Integrity Referee", unprompted, for peeking.
2. **The generator doesn't know Sculptured's features:** the first draft set up git worktrees by hand inside the Examiner's job, because the CLI sees only the description. Fix idea: tell the generator which features exist (own copies, checks, token limits) and let the sketch set team settings.
3. **No project-folder option** on the form (the spec had one), so every agent arrived with "needs a folder".
4. **Form layout:** no right margin; the Agent kinds select and the Next button touch the edge.

## Design board
5. **"Things to fix" panel covers part of a card** (Sonnet Builder), and an arrow runs behind it.
6. **Clicking an issue in the "Needs setup" list does nothing**; it should select the agent and focus its folder field.
7. **Team settings are hidden**: project folder (sets every agent at once) and "own copies" live in ⋯ → Details. I set four folders one by one before finding it.
8. Model choice is a select in the agent panel: fine.
9. **Folder picker**: clicking a folder name's text sometimes doesn't navigate (the clickable element is the row button; the text span didn't receive it).

## Start / Run
10. **The start dialog is clear:** "Start 4 Claude agents? They run in ~/bakeoff/ratelimit … First to start: Examiner."
11. **Own copies of a `--data-dir` instance go to ~/.sculptured/copies**, not under its data folder (isolation leak between instances).
12. **The Run graph draws an arrow only once a message has passed along it** ("1 message observed"). Before that, who hands work to whom isn't visible; one arrow label is clipped at the left edge.
13. **Codex plan at 100%** was visible in the corner and in /api/plan-usage; this is why the run is Claude vs Claude.
14. **Token limits and team budgets can't be added while a team runs** (409 team_running), so a cap can't be added mid-run. I used an external guard script instead.
15. **Tokens show "unknown" until a turn ends.** The Examiner's first turn ran for 22 minutes with no usage visible.
16. **A builder's passed check shows only as a dark dot beside "done"** on its Run card, not as readable text.
17. **The Git page needs a *project* folder.** With four agents sharing one folder but no project folder set, it says "Choose a project folder first" and lists no copies, so there's no Merge button for the winner.
18. **Result:** both builders passed 64/64 hidden tests (verified by Sculptured's checks, 2–3 s each). Opus Builder won on diff size (114 against 121). Neither builder touched ~/bakeoff/hidden except to run run.mjs (Opus made 5 tool calls, Sonnet 9). Reported tokens: Examiner 42.7k out, Opus 9.5k, Sonnet 4.6k, Judge 5.1k (cache reads not included; the Judge's turn was 229k including them). Wall time was 26 minutes, 22 of them the Examiner's.
