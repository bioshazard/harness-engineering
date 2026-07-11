# Full Pocock Crust POC

Hard-coded, durable control plane for:

```text
GRILLING → SPECIFYING → SLICING → IMPLEMENTING → REVIEWING → DONE
```

`src/workflow.ts` is the deep module: callers propose phase-scoped outcomes,
the operator accepts/rejects them, and a separately approved advance commits a
legal transition and typed Receipt. It is intentionally not a workflow DSL.

The shared `poc/crust/lib/` owns only reusable durable JSON storage and exact
skill source/content locks. `grill-me` now consumes those same adapters.

## Run

Install the five locked skills, including `to-spec` and `to-tickets` from
[`mattpocock/skills`](https://github.com/mattpocock/skills), then start Pi:

```bash
bun run crust:pocock -- --idea "..." --question authority:"Who advances state?"
```

`GRILLING` is an ordinary, many-turn Pi session. The child asks one question at
a time and calls `propose_decision` only when a branch is settled. You remain in
the TUI to inspect it and run:

```text
/crust approve <proposal-id>
/crust reject <proposal-id> <reason>
/crust advance
```

Approval does not advance state. Once the phase Receipt is admissible, Pi tells
you it is ready; `/crust advance` presents a second confirmation. It persists
the Receipt and tells you to exit. Resume the same durable run in a **fresh**
phase Context window:

```bash
bun run crust:pocock -- --resume <run-id>
```

Each resumed phase loads only its locked skill and Crust Context projection. In
`SPECIFYING`, the proposed `reference` must be a local retrievable Markdown
file; Crust reads it independently and verifies the six required `to-spec`
headings before admitting the proposal.

Runs persist below `.crust/runs/`; every resume verifies each referenced skill
lock before launching its phase-specific Pi child.

## Exercises

The ordinary test suite drives the same operator authority seam as the TUI,
without a model:

```bash
bun run test:crust
```

For an opt-in live exercise using the configured Codex OAuth session:

```bash
bun poc/crust/eg/pocock/pocock/test/live-grill-exercise.ts
```

It runs real `gpt-5.5` grilling turns, supplies scripted operator replies,
waits for the actual `propose_decision` tool call, approves it through the same
operator adapter as `/crust`, and advances the persisted run to `SPECIFYING`.
It is intentionally not part of the default test suite because it consumes a
live model request.
