# Three.js side-scroller v1

**Question:** Can a strict Pi Agent Core worker invent bounded, interactive
artifacts which a game-engine harness safely compiles into its world?

Run:

```sh
bun install
bun run dev
```

Controls: `A` / `D` to move, `Space` to jump. Reach the glowing ring.

The forge backend gives Pi one tool: `submit_artifact`. Pi has no filesystem,
shell, database, browser, network, or source-editing capability. The tool accepts
a bounded visual grammar and one of two mechanics:

- `support(span)` becomes a collision surface covering the gap.
- `propel(force)` becomes a launch zone beside the gap.

The harness rejects valid-looking artifacts that cannot clear the gap. It then
persists the proposal and receipt before trusted Three.js code compiles the
artifact into geometry and physics.

Runtime state and artifact receipts live under gitignored `data/`.
Saved artifacts can be replayed without another model call. The UI exposes the
manifest, model, content hash, independent clearability verdict, and completion
receipt.

**Probe result:** A live `openai-codex/gpt-5.4` Agent Core worker produced a
bounded spring launcher that completed the level. The harness rejects missing
tool calls, unknown fields, redundant capabilities, geometry outside budgets,
and mechanically insufficient artifacts.

This remains one level, one obstacle, one worker, and one declarative tool. It is
an inspectable authority probe, not a general game-engine API.
