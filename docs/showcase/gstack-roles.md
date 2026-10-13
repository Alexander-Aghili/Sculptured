# gstack-style product team (example)

`examples/teams/gstack-roles.sculptured-team.json` is a team of eight Claude agents that work through
a feature the way a small product team does: think and plan, build, review and test, ship, reflect.

## Credit

The roles and the sprint order are inspired by **gstack** by Garry Tan,
<https://github.com/garrytan/gstack>, an open-source set of Claude Code skills that frames the
assistant as a virtual team (CEO, designer, eng manager, QA, release manager and others). gstack is
MIT licensed (Copyright (c) 2026 Garry Tan). This example copies no gstack text: every job is written
in our own words. It is not made or endorsed by the gstack author.

## Roles only

This example uses roles, not gstack's skills. Each agent's job describes its role in plain words and
works without gstack installed.

| Group | Agent | Does | Model, token limit | gstack skill it resembles |
|---|---|---|---|---|
| Think & plan | Product reviewer (CEO lens) | Challenges the request and writes PLAN.md: goal, scope, success criteria, open questions | opus, 200k | `/office-hours`, `/plan-ceo-review` |
| Think & plan | Designer | Adds screens, flows and empty/error states to PLAN.md | sonnet, 200k | `/plan-design-review` |
| Think & plan | Eng lead (architect) | Adds components, data flow, risks, tests and ordered steps | opus, 250k | `/plan-eng-review` |
| Build | Builder | Implements the steps with tests on a feature branch; never pushes | sonnet, 600k | `/investigate` (bugs) |
| Review & QA | Code reviewer | Reviews the diff, fixes small issues, lists findings and gives a verdict | opus, 300k | `/review` |
| Review & QA | QA | Runs the tests and uses the feature like a user; reports bugs with evidence | sonnet, 400k | `/qa`, `/qa-only` |
| Ship | Release manager | Writes release notes and the PR description; may open a PR with `gh` | sonnet, 200k | `/ship`, `/document-release` |
| Reflect | Retro | Writes RETRO.md: what shipped, what slowed the team down, what to change | haiku, 150k | `/retro` |

Connections are plain "hands work to": Product reviewer → Designer → Eng lead → Builder → (Code
reviewer and QA) → Release manager → Retro. There is no workflow. Token limits count new tokens,
including subagents. Tools such as `gh` and `git` are not boxes on the board: the agents' jobs tell
them when to use them.

## Use it

1. In the template gallery, use **Import a team from a file** and choose the file.
2. Set the team's folder to your project. The file has no folder, so it works on any computer.
   Until you set one, every agent shows "needs a folder to work in".
3. Give the Product reviewer the request (what you want built), then start the team.

These are real Claude agents and may cost money.

## Using gstack's skills alongside it (optional)

If you install gstack yourself (see its README), each job already says the agent *may* run the
matching gstack skill (for example `/review` or `/qa`) and that it is not required. Things to know first:

- gstack installs into `~/.claude/skills`, so its skills are visible to **every** Claude agent on
  this computer, not only this team.
- Its setup also registers Claude Code hooks (for example a Stop hook and AskUserQuestion hooks).
  Nobody has yet checked whether these interfere with Sculptured's question routing or turn-end
  handoffs. Run one small check before relying on it.
- gstack writes its own logs and analytics on your computer. Read its README for what it records.
- gstack's Codex support is experimental. Codex agents would ignore the skill names in the jobs.

## Backlog: skills on agents and groups

Not built. The idea is to attach skills (any folder with a `SKILL.md`, not only gstack's) to an agent
or a group under Advanced, show them on the block (name, description, source file, where it came
from), and make them visible only to that agent when it starts. Open questions:

1. Copy attached skills into Sculptured (portable and shareable, but we store third-party files) or
   reference them by path (lighter, not portable)?
2. Attach per agent, per group (inherited), or both?
3. A Codex agent with Claude skills attached: refuse to start, warn and ignore, or pass the skill
   text in as instructions?
4. When a globally installed gstack (hooks, analytics, auto-update) affects every Claude agent, is
   that acceptable, or should Sculptured warn when it finds one?
5. How does the installed Claude Code load skills for one session only (`--add-dir`, a plugin
   folder)? This needs a spike against the real CLI before choosing a design.
6. Many skills depend on other files (gstack's need its `bin/` scripts, Bun and sibling skills).
   The block must show "requires X" rather than imply an attached `SKILL.md` works on its own.
7. Adding a skills field changes the `sculptured.team/v1` format, which old builds reject.

Background and options for deeper gstack support are tracked privately.
