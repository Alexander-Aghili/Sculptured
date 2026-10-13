# Live textbook production framework

## Start with input, not a fixed course

For a new project, select the Textbook creator template. Its Mathematical visualization group contains the reusable reference, builder and review roles. Open Input → Live textbook starter, choose an empty project folder and select Prepare textbook folder. This installs this framework and the local frontend without starting a run or choosing a source. Run `npm ci` in the folder before the first real run.

The Input block in Sculptured is the authoritative brief. It accepts multiple URLs, local paths, pasted notes, rough ideas, questions, intended audience, learning outcomes and constraints. Empty input means “await the operator,” not permission to invent a subject.

Possible inputs include an MIT OCW course index, one lecture PDF, a notesheet, selected textbook pages or an original syllabus. An OCW resource landing page must be resolved to its actual notes and related course context. Track access failures, missing chapters, ambiguous notation and licensing; ask for clarification when they change the learning plan. Do not treat every linked page as in scope automatically.

## Composition and control flow

Input → curriculum dispatcher → N independent or dependent interaction items → shared reusable stages → all-items barrier → textbook frontend.

The dispatcher chooses N from 1 to the configured maximum (24 initially; hard limit 64). N is the number of teaching interactions, not the number of operating-system processes. Six local CLI agents form the default reusable pool; each handles one assignment at a time. Independent topics have no ordering constraint. Stages can each have 1–8 interchangeable workers: open a stage on the board and use Create parallel worker while the team is stopped, or select existing agents with matching jobs. Different workers can process unrelated topics simultaneously, including at the same stage. Each agent still handles one assignment at a time, so a stage with one worker queues its topics. Dashed pool links show capacity, not handoffs. All inherit this project folder unless explicitly overridden.

Default interaction component:

1. Mathematical reference: `ready` → interaction builder.
2. Interaction builder: `ready` → mathematical checker; `research` → reference.
3. Mathematical checker: `pass` → UI reviewer; `revise` → builder; `research` → reference.
4. UI reviewer: `accept` → item complete; `revise` → builder, followed by fresh mathematical review.

Every stage can return `blocked`. Named outcomes select exactly one branch per stage completion. Each item retains its original context and stage history through loops. At most 12 stage completions per item are allowed initially (configurable to 32); reaching the bound blocks further automatic work. A fresh batch requires stopping and starting the project. Duplicate dispatch calls with identical batch IDs and contents are idempotent; conflicting manifests are rejected.

Stages are composable role instances: assign existing agents, add stages, add named outcomes, connect an outcome to another stage, or mark it as item completion. Several stages may use the same agent. Use the agent-layout view to add agents, set models and edit jobs. Dynamic routes replace ordinary “hands work to” edges for these projects, because fixed handoff graphs deliberately do not allow cycles. Compose reusable stages in the explicit graph. Any role may create bounded managed helpers with spawn_agent; each child inherits its runtime and directory and appears attached to its parent in Live. Native/background subagents are prohibited because their lifecycle cannot be controlled by this runner. Use send_agent_message for captured peer communication.

The frontend receives all accepted items only after the complete batch has passed its routes. It assembles the book and runs integration checks, then reports `done` or `blocked`. If integration finds a defect, report exact item IDs and revisions; do not silently approve the book. The operator can inspect and retry a blocked stage when safe. An exhausted step budget requires revisiting the plan.

## Choose useful boundaries

The dispatcher reads the sources before producing `curriculum/manifest.json`. Split by a learning question and its prerequisite closure, not by page count. A task should answer a question that a learner can investigate and a reviewer can assess independently. Combine definitions needed for the same phenomenon; separate concepts with substantially different notation or prerequisites. Document why each interaction is useful and why some material stays prose/proof.

For each unit record:

- Stable ID, title, source pages/sections and position in reading order.
- Audience, objectives, prerequisites and common misconceptions.
- Exact mathematical definitions, assumptions, domain and notation.
- A meaningful control → mathematical change → visual/textual explanation.
- Examples, counterexamples, singular/degenerate cases and numerical limits.
- Proposed diagram, simulation, geometric construction or proof exploration.
- Required files, component interface, keyboard/mobile behavior and acceptance checks.
- What this unit does not cover and which later unit depends on it.

Preserve operator constraints in every item context. Reference the shared manifest and interface contract. Prefer a focused batch over an unnecessarily large plan; list deferred material explicitly.

## Context and artifact contracts

The `dispatch_work` call supplies a stable `batch_id`, shared summary and an array of `{id,title,context,mode,depends_on}`. Use `mode: "independent", depends_on: []` for unrelated work, or `mode: "dependent", depends_on: ["topic-id"]` when another topic’s accepted artifacts are needed. Dependent topics wait for all listed topics to be accepted and receive their final reports; blocked prerequisites keep them waiting. Dependencies must name distinct existing topics and contain no cycles. Learning/reading order alone does not require a production dependency. Existing batches without these fields default to independent. The operator can change these options in Work evidence only before a topic has ever been assigned; later manifest replays must match the saved choices. Context includes source pointers, relevant definitions, prerequisites, the learning question, expected controls, file ownership and tests. Sources too long for a prompt belong in local source files with exact page references. Do not pass only “see previous chat.”

Shared files:

| Path | Owner | Purpose |
| --- | --- | --- |
| curriculum/manifest.json | Dispatcher | Semantic units, order, dependencies and coverage |
| curriculum/source-map.json | Dispatcher / reference | Source identity, URL/path, pages, author, access and reuse terms |
| curriculum/interface-contract.md | Dispatcher / frontend | Rendering, math, styling, ownership and evidence conventions |
| src/contract.ts | Frontend | Typed lesson contract and assembly validation |
| src/registry.ts | Frontend | Accepted modules in prerequisite order |
| src/math/ | Coordinated builders | Pure, tested mathematical helpers |
| src/interactions/ | Coordinated builders | Reusable controls and interaction primitives |
| modules/<id>/lesson.tsx | Assigned builder | One exported lesson and optional interaction |
| modules/<id>/references.json | Reference | Exact citations, examples and reuse notes |
| modules/<id>/design.md | Reference / builder | Learning question and design rationale |
| modules/<id>/checks/ | Checkers | Revision-specific tests, real captures and findings |

`Lesson` provides stable ID, title, chapter, order, summary, objectives, prerequisites, citations, revision, check records, `Content` and optional `Interaction` components. Modules must load without their own global app root and must clean up event listeners. Avoid global state collisions and unbounded animation. A module can compose several smaller mathematical, control and visualization components.

## General interactive mathematical toolkit

The starter includes typed parameter controls, a bounded curve sampler, discontinuity-aware SVG paths, a numerical/text fallback and a labeled ellipse toolkit preview. These are building blocks, not a claim to support every mathematical subject automatically. Extend with pure tested helpers and topic-appropriate interactions: epsilon–delta challenges, sequence tails, level sets, tangent/normal frames, curvature, geodesics, counterexample builders, proof dependency views or symbolic steps.

Do not use `eval` on user input. If arbitrary formulas are required, adopt a deliberately limited parser with domain/function allowlists and an explicit complexity limit. Disclose approximate sampling, solver tolerances and singularities. Prefer exact identities when available and compare numerical behavior against known cases. A browser picture must never be labeled as a proof merely because it looks plausible.

Each lab needs meaningful default values, reset, clear units and scales, labeled axes/objects, keyboard controls, accessible names, a text/table explanation of the current state, a narrow-screen layout and reduced-motion behavior. Learners should be able to predict, manipulate, observe and explain. Errors must explain how to recover. Preserve user state while inspecting evidence.

## Reviews, revisions and acceptance

Mathematical review independently checks assumptions, derivations, implementation and examples. Use known solutions, invariants, adversarial inputs, boundary/singular cases and convergence/domain checks as applicable. Inspect evidence rather than trusting the builder's summary.

UI review operates the actual app. Capture real desktop and mobile states, test pointer and keyboard paths, inspect focus, clipping, equations, disabled/error states, source links and clarity of explanation. If browser access is unavailable, return blocked and state what remains untested. No invented screenshots or simulated walkthroughs.

Reports name the task, artifact revision/hash, checks actually run, command/capture paths, findings, severity and limitations. Any builder revision invalidates previous acceptance until it is checked again. `accept` is the reviewer’s report; Sculptured labels it agent-reported, not independently verified. The frontend reruns integration checks before reporting assembly done.

## Runtime reliability

Assignments, branches, revisions and results are stored durably per project start. Work remains scoped to the configured agents and project; other agents cannot dispatch or complete someone else's assignment. The active assignment ID rejects stale/conflicting completions. Shared workers receive isolated task briefs but reuse their native session, so task IDs and folder ownership remain essential.

Stop team prevents new routing and rejects late completions. Pending items and earlier run evidence remain inspectable. Restarting the controller preserves state. A message whose acknowledgement is uncertain is never automatically duplicated: inspect the transcript, resolve the worker/session state, then retry a blocked stage or start a new batch. Plain turn completion without a structured result becomes blocked. Failed checks and unknown delivery stay visible.

## Frontend and delivery

The starter is a local browser textbook shell with search, chapter navigation, stable section links, prerequisites, source/evidence panels, responsive reading layout and banner-free Text Mode with an exit. The registry begins empty. The homepage explicitly says no course has been generated.

Run `npm install`, `npm test`, `npm run build`, then `npm run dev`. All assets and computation should work locally. The final static `dist/` can later be hosted through an operator-selected delivery command; public deployment is a separate instruction. Do not provision hosting or embed credentials.

Before declaring completion: validate IDs/dependencies/contracts, verify citations and current-revision checks, run build/math/integration checks, exercise the actual assembled app on desktop and mobile, and record remaining limitations. Explain missing evidence rather than turning reported completion into verified correctness.

## Shared 3D engine
Engine creator → independent engine verifier → reference → visualizer → checker. The visualizer may route missing capabilities back to the engine stage. Engine support answers peer requests with documentation, API guidance or a reproducible feature request. See src/engine/README.md. The Visualization and 3D Engine Creator groups can be reused separately from the Library.
