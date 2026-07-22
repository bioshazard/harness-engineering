# Crust

> Active research apparatus, absorbed from `bioshazard/pi-crust` at commit
> `1b233b7`. It explores one demanding Pocock workflow; it is not a product or a
> canonical workflow for other projects.

See the [Pocock case-study note](./pocock-case-study.md) for the question this
apparatus explores and the limits of applying it elsewhere.

Pi-native, durable Pocock v1.1 workflow POC. Stock Pi loads the project-local
extension at `.pi/extensions/crust.ts`; SQLite and `.crust/objects` hold workflow
authority and immutable evidence.

```sh
bun install
bun run skills:install
bun test
pi --no-extensions --no-skills --no-prompt-templates --no-context-files \
  --no-builtin-tools --extension .pi/extensions/crust.ts
```

Inside Pi, use `/crust start <idea>`, `/crust status`, `/crust evidence`, and
`/crust next [ticket]`. Proposal tools open the operator decision popup and advance
automatically. `/crust accept` and `/crust reject` remain recovery commands. Only
the active state's proposal tool is exposed to the model.
Crust also activates a locked builtin-tool allowlist and bounded `stage_artifact` tool.

Run `bun run test:live` for the opt-in stock-Pi/OAuth exercise; default tests remain model-free.

Link the development CLI once, then launch Crust from any target folder:

```sh
bun link
cd /path/to/target
crust .
```

The launcher installs the pinned project-local skills when needed, then runs isolated
Pi with workflow state stored under the target's `.crust/` directory. Its private lock
does not replace the target's existing skills setup.

Proposal dialogs show a deterministic summary and can open the full immutable payload
and artifacts before acceptance. Tickets retain their work contract and acceptance
criteria; each fresh ticket session receives resolved specification and ticket content.
Review runs isolated read-only Standards and Specification agents in parallel before a
review proposal becomes legal.

Without linking, use `bun run crust -- /path/to/target` from this checkout.
