# How internals pages are written

These pages are for people changing Sculptured. They follow four well-tested models:

- [Diátaxis](https://diataxis.fr/): keep **explanation** (why it is shaped this way), **reference** (exact facts: messages, tables, routes) and **how-to** (steps to do one task) apart. A page may hold more than one, but each in its own section with its own heading.
- [C4 model](https://c4model.com/): draw at the zoom level the reader needs. The [overview](overview.md) is context and containers; each page zooms into one container's components. Never mix levels in one diagram.
- [arc42](https://arc42.org/overview): runtime behaviour is shown as a few concrete scenarios (sequence diagrams), deployment as a topology, and rules that cut across parts ("crosscutting concepts") are stated once and linked.
- [ARCHITECTURE.md](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html) (as in rust-analyzer): a bird's-eye view first, then a code map, and explicit **Architecture invariants**, including things that are deliberately absent.

## Page shape

1. Title and a two- or three-sentence summary a newcomer can understand.
2. `Sources:` the files the page describes, as paths. Everything the page claims is checkable there.
3. A first diagram that answers "what are the parts and how do they connect?"
4. Numbered sections. Runtime behaviour as one or two sequence diagrams of real scenarios. State machines as `stateDiagram-v2`. Tables of record as `erDiagram` or Markdown tables.
5. **Architecture invariants**: the rules that must stay true, each one sentence.
6. **Properties and their tests**: a table mapping each important property to the test that pins it (file and test name).
7. Optional **Not built yet / deferred**, labelled plainly.

## Rules

- **Only what the code does.** If you did not find it in the source, it is not on the page. Planned or deferred work is labelled *planned* or *deferred*, never described as if it exists.
- **Provenance words matter.** Keep "agent-reported", "captured", "observed", "heuristic" and "verified" distinct, as the product does.
- **Plain words first.** Name the user-facing concept, then the code name in backticks: "a team's own copy (`localops::copies`)".
- **Diagrams are Mermaid** so they render on GitHub and in Mintlify. Label every arrow with what flows along it. Keep a diagram under about 15 nodes; split it rather than shrink it. Quote labels that contain punctuation: `A["Run check (timeout)"]`.
- **Short sentences, active voice, no marketing.** Prefer a table to a paragraph of facts.
- Link other pages instead of repeating them.
