# hello-2: Contextual Authority

This lab copies `sandbox/input.txt` through guarded `read_file` and
`write_file` capabilities. Authority depends on the snapshotted Principal,
requested Capability, and normalized State resource.

```sh
bun run allowed
bun run forbidden
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

## Layer map

```text
Pi SDK                         → vanilla model harness
CODEAUTH/tool composition      → domain meta-harness
read then guarded write        → workflow
host authority and Evaluation → micro Goal System
```

Policy governs the outcome transition; model permissions alone do not
determine success.

## Verify

Requires Bun 1.2.17+ and `OPENROUTER_API_KEY` in repository-root `.env`.

```sh
bun install --frozen-lockfile --ignore-scripts
bun test
bun run typecheck
bun run allowed
bun run forbidden
```

## Deferred

Retries, alternate destinations, globs, groups, ownership, modes, inheritance,
and mutable Policy are intentionally excluded.

## Frozen limitations

This example demonstrates the authority model, not production filesystem
security:

- `read_file` and `write_file` transport UTF-8 text, not arbitrary bytes.
- Symlink rejection is a preflight check. A filesystem race can replace a
  checked component before the subsequent read or write.
- Policy loading validates Grant shape but assumes Policy resources are already
  canonical relative paths.
- Git email supplies a deterministic Principal label; it does not authenticate
  a person or process.
- Proposal evidence records read content, while write/block outcomes rely on
  Effect plus the final destination Observation rather than a separate
  per-Proposal Observation.
- Executor output is model-dependent. Mechanics tests establish deterministic
  authority behavior; model-backed runs demonstrate integration, not
  repeatability.

Addressing these would require a binary-safe capability interface, race-safe
filesystem primitives or isolation, canonical Policy validation, authenticated
workload identity, richer Receipt semantics, and deterministic execution.
Those belong to later examples rather than silent expansion of this one.
