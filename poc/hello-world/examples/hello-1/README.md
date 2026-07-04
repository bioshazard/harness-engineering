# hello-1: One Guarded Write

This lab implements the [Hello World chapter](../../README.md) as one bounded
Pi SDK Harness Run:

```text
Intent → Proposal → Guard → Capability → Observation → Evaluator → Receipt
```

## Contract

- Intent: `./sandbox/hello.txt` contains exactly `hello world`
- Executor: Pi using an OpenRouter model
- Capability: one `write_file(path, content)` tool
- Guard: resolved path must equal the target path
- Evaluator: readback bytes must equal `hello world`
- Reaction: terminate after the first Proposal
- Receipt: one JSON object emitted by the host

The model proposes. The Guard authorizes. The tool writes. The host reads,
evaluates, terminates, and emits the Receipt.

## Run

Requires Node 22.19 or newer and an OpenRouter API key.

```sh
cp .env.example ../../../../.env
# Set OPENROUTER_API_KEY in the repository-root .env
npm install
npm run --silent start
```

`OPENROUTER_MODEL` defaults to `openrouter/free`.

A successful run emits:

```json
{"intent":{"path":"./sandbox/hello.txt","content":"hello world"},"model":"openrouter/free","proposal":{"path":"./sandbox/hello.txt","content":"hello world"},"guard":{"verdict":"allow"},"tool":{"verdict":"written"},"readback":{"verdict":"match","content":"hello world"},"verdict":"success"}
```

Stdout contains only the Receipt. Diagnostics use stderr.

- `0`: success
- `1`: completed Harness Run with failure verdict
- `2`: setup or runtime failure

## Code map

- `src/index.ts`: fixture, Pi session, termination, evaluation, Receipt, exit
- `src/extension.ts`: tool registration, Proposal capture, Guard
- `src/harness.ts`: fixed contract and testable mechanics
- `config/models.json`: isolated OpenRouter model definition
- `test/harness.test.ts`: allow, block, and mismatch cases

## Verify

```sh
npm test
npm run typecheck
```

The tests establish three distinct outcomes:

1. Allowed Proposal, matching Effect: success.
2. Blocked Proposal: no Effect, failure.
3. Allowed Proposal, mismatching Effect: failure.

## Non-goals

No retries, durable ledger, multiple tools, configurable intent, model
self-evaluation, or production filesystem sandboxing. Each would obscure a
boundary this first lab exists to reveal.
