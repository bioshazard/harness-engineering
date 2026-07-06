# Instrumented dependency upgrade

This tracer bullet composes the frozen [`../dependency-upgrade`](../dependency-upgrade)
control logic through the registry SDK. It locks all governed dependencies,
verifies them before execution, emits root/transition spans to Phoenix, and
wraps the existing Parent Receipt in a portable Receipt envelope.

```bash
npm run example:seed
npm run example:live
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

The ordinary client surface is intentionally small:

```ts
const system = await dependencyUpgradeSystem({ live: true });
const receipt = await system.run({ dependency: "minimatch@9.0.9" });
```

`compose()` performs publication, one-time resolution, canonical lock
persistence, preflight verification, tracing, and Receipt correlation.
