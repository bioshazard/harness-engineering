# Draft-Only Email Lab

No provider, credential, network access, or model is required.

```bash
cd poc/email-draft-only
npm ci --ignore-scripts
npm run typecheck
npm test
```

The deterministic Executor receives selected-thread Context and emits
Proposals. The in-memory mailbox represents a broadly capable provider adapter;
only the draft Capability crosses the harness seam.

Expected result: eight passing conformance scenarios.

The next integration must use a dedicated test mailbox and explicit external
approval. A broad credential may remain behind the adapter, but raw provider
operations must never become Executor tools.
