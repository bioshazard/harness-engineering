# Three.js side-scroller prototype

**Question:** Can a strict Pi Agent Core worker invent bounded, interactive
artifacts which a game-engine harness safely compiles into its world?

Run:

```sh
bun install
bun run dev
```

Controls: `A` / `D` to move, `Space` to jump. Reach the glowing ring.

The forge backend gives Pi one tool: `submit_artifact`. Pi has no filesystem,
shell, database, browser, network, or source-editing capability. The harness
validates and persists the proposal, then trusted Three.js code compiles it.

Runtime state and artifact receipts live under gitignored `data/`.

**Probe result:** A live `openai-codex/gpt-5.4` Agent Core worker produced and
submitted bounded artifacts through the sole tool. The harness rejected missing
tool calls, allows one corrective turn, validates unknown fields and budgets,
persists receipts, and compiles accepted specs into game physics and geometry.
