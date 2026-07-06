# Dependency Upgrade Lab

Requires Bun 1.2.17+ and network access for integration.

## Deterministic conformance

```bash
cd poc/dependency-upgrade
bun install --frozen-lockfile --ignore-scripts
bun test
bun run typecheck
```

These tests use deterministic child adapters and no registry or model. They
exercise valid repair, blocked protected mutation, ineffective repair, and
independent diff enforcement.

To exercise the real registry transition with a known-valid remediation but no
model:

```bash
bun run integration:deterministic
```

## Model-backed integration

Root `.env` must define `OPENROUTER_API_KEY`.

```bash
bun run integration
```

The integration copies the pinned fixture to an isolated temporary workspace,
installs with lifecycle scripts suppressed, performs the real
`minimatch@3.1.2` to `9.0.9` transition, and gives one guarded adapter
replacement Capability to the model. The script supplies the required
`--allow-external-model` approval flag, acknowledging that adapter code,
compiler diagnostics, and installed declaration context are sent to
OpenRouter. Direct CLI invocation fails closed without this flag.

JSON stdout contains `runRoot`, `receiptPath`, the parent Receipt, and an
accepted candidate workspace path. Each `/tmp/dependency-upgrade-run-*` root
retains the Receipt and artifacts. Rejected candidate workspaces are deleted;
set `KEEP_WORKSPACE=1` to preserve one while debugging.

`OPENROUTER_MODEL` overrides the default `openrouter/free`.
