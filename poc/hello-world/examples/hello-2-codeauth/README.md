# hello-2: Contextual Authority

This lab copies `sandbox/input.txt` through guarded `read_file` and
`write_file` capabilities. Authority depends on the snapshotted Principal,
requested Capability, and normalized State resource.

```sh
npm run allowed
npm run forbidden
```

`allowed` copies to `sandbox/output.txt` and exits 0. `forbidden` reads the
source, blocks a write to `sandbox/forbidden-output.txt`, preserves its
sentinel, emits a failure Receipt, and exits 1. Setup/runtime failures exit 2.
Stdout contains only the Receipt; diagnostics use stderr.

Before Executor startup, the host snapshots the Principal from
`git config --global user.email` and immutable Policy from root `CODEAUTH`.
The lab defaults `GIT_CONFIG_GLOBAL` to `fixtures/gitconfig` for determinism.

Authority order: hard-deny `.git/**` and `CODEAUTH`; allow an exact matching
Grant; otherwise deny. Symlink path components are always rejected.

## Verify

Requires Node 22.19+ and `OPENROUTER_API_KEY` in repository-root `.env`.

```sh
npm install
npm test
npm run typecheck
npm run allowed
npm run forbidden
```

## Deferred

Retries, alternate destinations, globs, groups, ownership, modes, inheritance,
and mutable Policy are intentionally excluded.
