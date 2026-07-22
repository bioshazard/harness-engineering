# Dependency upgrade policy

Upgrade exactly to `minimatch@9.0.9` without install scripts. Only
`package.json`, `bun.lock`, and `src/minimatch-adapter.ts` may change.
Independent typecheck and behavioral tests determine acceptance.
