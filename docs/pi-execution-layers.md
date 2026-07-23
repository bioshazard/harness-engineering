# Pi execution layers

Pi supplies more than one level of agent execution. Select the smallest level
that supplies the necessary behavior.

This document describes execution roles. It does not define a workflow or a
Goal System.

## Layer map

```text
host control system
  deterministic worker
  domain agent worker
    @earendil-works/pi-agent-core
  software worker
    @earendil-works/pi-coding-agent SDK
      @earendil-works/pi-agent-core
  operator workbench
    @earendil-works/pi-coding-agent CLI and TUI
      Pi extensions
      @earendil-works/pi-agent-core
```

The layers are alternatives for different tasks. A large system can use all
the layers.

## Agent Core

`@earendil-works/pi-agent-core` is the agent execution runtime. It owns one
agent run.

Agent Core supplies these functions:

- Model interaction.
- Message state.
- Tool calls and tool results.
- Agent lifecycle events.
- Steering and follow-up messages.
- Context transformation.
- Hooks before and after tool calls.

Use Agent Core for a narrow headless agent. Give the agent a small set of
domain tools.

Typical tasks include extraction, classification, planning, drafting, and
domain review.

Agent Core state is agent state. It is not durable workflow authority.

## Coding Agent SDK

`@earendil-works/pi-coding-agent` includes a programmatic SDK. The
`createAgentSession()` function creates a coding-agent session on Agent Core.

The Coding Agent SDK adds these functions:

- Coding tools.
- Session management.
- Model and authentication management.
- Resource loading.
- Extensions.
- Skills and context files.
- Prompt templates.
- Compaction and retry behavior.

Use the Coding Agent SDK for a worker that must inspect or change a software
repository. Typical tasks include implementation, remediation, migration,
testing, and repository review.

The SDK can run without the Pi command-line interface. Use this headless form
for unattended workers.

## Coding Agent CLI and TUI

The Coding Agent CLI is an interactive shell. Its terminal user interface adds
dialogs, editors, notifications, streaming output, and session controls.

Use the CLI and TUI when an operator must participate during the run. An
operator can inspect a proposal, approve a transition, supply information, or
resume work.

Do not use the CLI as the normal protocol between machines. Use the Coding
Agent SDK for unattended execution.

## Pi extensions

A Pi extension adds a domain composition to Coding Agent. An extension can add
tools, hooks, prompts, resources, and operator controls.

The same extension can support a headless SDK session and an interactive CLI
session. This property can keep worker behavior consistent across both modes.

An extension does not make its model authoritative. A guard or control kernel
must decide whether a model proposal can cause an effect.

## Host control

The host control system coordinates work around Pi. It can run in the same
process as Pi or in a separate service.

The host control system owns these items when the problem requires them:

- Intent and workflow state.
- Capability bounds.
- Budgets and retry limits.
- Sandboxes and worktrees.
- Independent observation and evaluation.
- Promotion and terminal decisions.
- Evidence and receipts.

This ownership is an authority boundary, not a process boundary. A Pi extension
can call a control kernel, but the model cannot replace that kernel.

Keep these distinctions:

```text
agent state is not workflow state
agent completion is not outcome acceptance
a tool call is not authorization
a tool result is not independent evidence
```

## Selection procedure

Use this sequence for each task:

1. Use deterministic code when it can do the task.
2. Use Agent Core for a narrow domain agent.
3. Use the Coding Agent SDK for a software worker.
4. Add the CLI and TUI when an operator must join the run.
5. Keep outcome evaluation and terminal authority outside the model.

Do not select a large layer only because it is available. Each additional
layer adds behavior, configuration, and policy surfaces.

## Examples in this workshop

- Hello World uses the Coding Agent SDK for a small guarded software worker.
- Dependency Upgrade uses the SDK for bounded source remediation.
- Crust uses the CLI and TUI because operator interaction is part of the test.
- Poducer uses headless SDK sessions for draft, review, and image workers.

The [Pi substrate incubator](../incubator/pi-substrate/) tests how these layers
fit a larger software factory. Its
[Poducer case study](../incubator/pi-substrate/poducer-case-study.md) gives one
pinned external implementation.

## References

- [Pi packages](https://github.com/earendil-works/pi)
- [Agent Core](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Coding Agent SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf)
