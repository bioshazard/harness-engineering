# Instrumented dependency upgrade

This tracer bullet composes the frozen [`../dependency-upgrade`](../dependency-upgrade)
control logic through the registry SDK. It locks all governed dependencies,
verifies them before execution, emits root/transition spans to Phoenix, and
wraps the existing Parent Receipt in a portable Receipt envelope.

```bash
npm run example:seed
npm run example:live
npm run example:live:model
px trace get <trace-id> --project "harness eng"
```

The example locks the repository prompt by default. Set
`PHOENIX_PROMPT_NAME` to resolve and lock an existing Phoenix prompt version.
`example:seed` can create the sample prompt when the configured key has prompt
write permission.

Live mode reads:

- `PHOENIX_API_KEY`
- `PHOENIX_PROJECT_NAME` defaulting to `harness eng`
- `PHOENIX_ENDPOINT` defaulting to `https://phoenix.talos.bios.dev`

`example:live:model` invokes the locked OpenRouter model with the locked
Phoenix system prompt. It explicitly opts into sending fixture adapter code,
compiler diagnostics, and dependency declarations to OpenRouter. The active
Phoenix transition records requested/response model IDs, prompt version, and
the host-owned authority verdict. Verification spans record their child
Receipt and typecheck/test verdicts. The root span records terminal verdict,
content-addressed Receipt ID, and evidence counts. Proposal and authority
events contain identity metadata, not source or prompt content.

After the trace is flushed, evaluator evidence from the terminal Receipt is
mirrored into Phoenix trace annotations. Annotation metadata binds Receipt,
Composition, evaluator, and evaluated child Receipt identities and explicitly
marks the annotation `observation-only`; Phoenix does not choose Reaction or
terminal acceptance.

The default request model is the static
`nvidia/nemotron-3-super-120b-a12b:free` identifier. `OPENROUTER_MODEL`
overrides it; the returned provider model remains execution evidence rather
than promotion authority.

The OpenRouter invocation is a nested OpenInference `LLM` span under the
Goal-System remediation transition. It records structured input/output
messages, the `replace_adapter` tool schema and call, requested and returned
model identities, provider response ID, finish reason, token usage, and cost.
The parent transition retains policy, Proposal, and authority evidence.

The ordinary client surface is intentionally small:

```ts
const system = await dependencyUpgradeSystem({ live: true });
const receipt = await system.run({ dependency: "minimatch@9.0.9" });
```

`compose()` performs publication, one-time resolution, canonical lock
persistence, preflight verification, tracing, and Receipt correlation.
