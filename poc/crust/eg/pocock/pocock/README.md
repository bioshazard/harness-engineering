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
[`mattpocock/skills`](https://github.com/mattpocock/skills), then:

```bash
bun run crust:pocock -- --action start --intent "..." --question authority:"Who advances state?"
bun run crust:pocock -- --run <id> --action status
```

Use `--action propose-* --json '<payload>'`, then `approve`, then `advance`.
For `propose-spec`, `reference` must be a local retrievable Markdown file; the
controller reads it independently and verifies the six required `to-spec`
headings before admitting the proposal.

`advance` is deliberately a separate operator action: proposal acceptance is
never itself a transition. Runs persist below `.crust/runs/`; resuming code
must verify each referenced skill lock before launching a phase-specific Pi
child. The existing `grill-me` POC remains the reference Pi TUI child adapter.
