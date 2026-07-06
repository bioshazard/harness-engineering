# Composition registry

The module gives ordinary clients one interface:

```ts
const system = await compose({
  name: "dependency-upgrade",
  workflow: workflow("src/workflow.ts", runUpgrade),
  prompt: phoenixPrompt("dependency-remediator", { tag: "production" }),
});

const receipt = await system.run(intent);
```

`compose()` expands the versioned Default Profile, publishes the Manifest,
resolves mutable selectors once, persists the canonical Composition Lock, and
returns an object permanently bound to its Composition ID. `run()` verifies
locked identities, initializes Phoenix tracing, executes the local workflow,
and returns a terminal Receipt.

## Advanced lifecycle

`Registry` exposes `publish`, `resolve`, `promote`, and `load` for operators and
conformance tests. Publication never moves aliases. Promotion is explicit
compare-and-swap. Resolution failures are structured and never masquerade as
Receipts.

## Storage

The MVP filesystem adapter stores immutable manifests and locks plus mutable
name/alias pointers. It can be replaced by SQLite without changing the client
interface.

## Identity

Locks use schema version `1`, RFC 8785 canonical JSON, and SHA-256. Local files
are content-addressed and reverified before execution. Phoenix prompt aliases
resolve to immutable version IDs; prompt content contributes to the digest but
is not copied into registry storage.
