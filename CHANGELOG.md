# Changelog

All notable changes to Sculptured are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Where tokens went: a report per run made on the runner by MAIS from the CLIs' session files (`analyze-run`, `usage-reports` capability), kept by controld and refreshed every minute while a run goes (`GET /api/teams/{id}/report`), shown on the Run board and in History. `budget-state-changed` events.
- Import a Claude Code session (with its subagent files) or Codex rollouts as a read-only past run and a runnable team (`POST /api/runs/convert`, then the existing `/api/runs/import`), under Advanced. "Improve this team with AI" (`POST /api/teams/{id}/improve-from-run`) proposes a reusable version as a labelled diff.
- Team limits on spawned agents (`limits.max_agents`, `limits.max_child_levels`), set under Advanced; none by default. The fixed caps of 10 children per agent, 64 agents and 4 levels are removed. The Run board folds many children into "+N more" and deep ones into "+N deeper".
- First public release of the Sculptured core under the Apache License 2.0: the team board, live agent control for Claude Code and Codex, workflows with checks, reviews and merges, team files and run files, connected computers, the desktop app and the docs site.
