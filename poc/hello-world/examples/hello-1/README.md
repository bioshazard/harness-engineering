# hello-1

One bounded Pi SDK Harness Run:

```text
intent → model proposal → Guard → write_file → readback Evaluator → Receipt
```

## Run

Requires Node 22.19 or newer.

```sh
cp .env.example .env
# Add OPENROUTER_API_KEY to .env
npm install
npm run --silent start
```

`OPENROUTER_MODEL` defaults to `openrouter/free`.

The run prints exactly one JSON Receipt to stdout. Diagnostics use stderr.
Exit codes: `0` success, `1` evaluated failure, `2` setup/runtime failure.

## Verify

```sh
npm test
npm run typecheck
```
