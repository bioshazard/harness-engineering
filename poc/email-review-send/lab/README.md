# Email Review-and-Send Lab

## Deterministic conformance

```bash
cd poc/email-review-send
npm ci --ignore-scripts
npm run typecheck
npm test
```

No provider, credential, network, or model is required. Expected result:
twelve passing tests across the MCP contract and meso control paths.

## Model-backed mock integration

Root `.env` must contain `OPENROUTER_API_KEY`.

```bash
npm run integration
```

The script supplies `--allow-external-model`, explicitly approving disclosure
of the selected mock thread and generated draft to OpenRouter. Direct execution
fails closed without that flag. `OPENROUTER_MODEL` overrides
`openrouter/free`.

Both drafter and reviewer are model-backed. Sending affects only the in-memory
mock provider. No live email credential or capability exists.
