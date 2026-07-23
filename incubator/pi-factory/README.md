# Pi factory probe

> Status: runnable probe. This entry tests one process and authority boundary.
> It is not a production sandbox or a complete software factory.

## Question

Can a factory keep its state machine and Agent Core runtime outside the
environment where coding effects occur?

## Shape

```text
factory container (read-only)
  one build state machine
    ready -> building -> succeeded | failed
  @earendil-works/pi-agent-core
    system prompt
    one string input
    no local tools
    MCP proxy tools
      read, bash, edit, write
            |
            | Streamable HTTP MCP
            v
dev-box container
  vanilla @modelcontextprotocol/sdk server
  read, bash, edit, write implementations
  /workspace bind mount
```

Pi Coding Agent 0.80.2 enables `read`, `bash`, `edit`, and `write` by default.
This probe uses those exact names and input shapes. It does not import Coding
Agent or its implementations. The factory discovers the tools through MCP and
adapts each MCP descriptor to an Agent Core tool. Each adapter only calls the
MCP client.

Thus, “no tools in the factory” means no tool effect runs there. Agent Core
must still receive tool descriptions. Otherwise the model cannot request work
in the dev box.

## Run

```bash
mkdir -p workspace
BUILD_INPUT='Create hello.txt containing hello, then verify it.' \
docker compose up --build --abort-on-container-exit --exit-code-from factory
```

Compose mounts `${HOME}/.pi/agent/auth.json` read-only into the factory. The
factory copies credentials into memory so OAuth refresh cannot modify the host
file. It defaults to `openai-codex/gpt-5.4`. Set `PI_AUTH_FILE`, `PI_PROVIDER`,
or `PI_MODEL` to override them. To use OpenRouter, set `PI_PROVIDER=openrouter`,
`PI_MODEL=<model-id>`, and `OPENROUTER_API_KEY`.

Run the deterministic and MCP-boundary tests without a model:

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
```

## Boundary

The factory container has no workspace mount and has a read-only filesystem.
The dev box owns all file and shell effects. A failed MCP call becomes a tool
failure. A failed build becomes `failed` factory state. Tool calls have a
10-second timeout. A complete build has a 120-second deadline.

This is containment, not immunity. The dev box can return hostile output,
consume its own resources, or become unavailable. MCP does not create
isolation; the second container does. A production version still needs resource
limits, authentication, output limits on every tool, durable factory state,
receipts, and independent evaluation before promotion.

## Notice

Agent state is still not factory state. Model completion is still not outcome
acceptance. The successful build result is only a proposal recorded by the
factory machine.
