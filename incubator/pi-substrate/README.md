# Pi substrate for a software factory

> Status: design note. This note assigns Pi packages to software-factory roles.
> It does not define a final architecture.

See [Pi execution layers](../../docs/pi-execution-layers.md) for the shared
package and runtime boundaries.

## Question

Where does each Pi package belong in a software factory?

Pi supplies agent execution. The factory must keep authority over the work and
its results.

## Terms

A **factory control plane** coordinates work and decides when work is complete.

A **worker** performs one bounded task and returns a proposal with evidence.

**Agent state** is the message and tool state for one agent session.

**Factory state** is the durable state of jobs, policies, artifacts, and
promotion decisions.

Agent state and factory state are not the same state.

## Recommended stack

```text
factory control plane
  deterministic worker
  domain worker
    @earendil-works/pi-agent-core
  software worker
    @earendil-works/pi-coding-agent SDK
      @earendil-works/pi-agent-core
  operator workbench
    @earendil-works/pi-coding-agent CLI and TUI
      Pi extension
      @earendil-works/pi-agent-core
```

The factory control plane stays outside Pi. Each Pi worker has a bounded
interface to the control plane.

## Factory control plane

The factory control plane owns these items:

- Intent and job state.
- Queues and schedules.
- Budgets and retry limits.
- Worktrees and sandboxes.
- Policy and authorization.
- Independent evaluation.
- Artifact and evidence storage.
- Promotion and terminal decisions.
- Durable receipts.

The control plane treats each worker result as a proposal. A worker cannot
approve its own proposal.

Pi session storage can help a worker continue its work. It does not replace
durable factory state.

## Agent Core

`@earendil-works/pi-agent-core` is the small execution substrate. It supplies
the model loop, message state, tool calls, events, and steering.

Use Agent Core for a headless worker that does not need coding-agent resources.
Examples include these workers:

- A structured data extractor.
- A package drafter.
- A domain reviewer.
- A classifier.
- A planner with a small set of domain tools.

Give the worker only the tools that its task requires. Put tool authorization
at the tool boundary.

Agent Core does not own the factory workflow. It also does not decide whether
an artifact is ready for promotion.

## Coding Agent SDK

`@earendil-works/pi-coding-agent` includes a programmatic SDK. The SDK builds a
coding-agent session on Agent Core.

The SDK adds facilities such as these:

- Coding tools.
- Session management.
- Model and authentication management.
- Resource loading.
- Extensions.
- Skills and context files.
- Prompt templates.
- Compaction and retry behavior.

Use the Coding Agent SDK for a worker that must understand or change a software
repository. Examples include these workers:

- An implementation worker.
- A dependency-remediation worker.
- A test-and-fix worker.
- A repository reviewer.
- A migration worker.

The SDK can run without a terminal user interface. Use this headless form for
normal factory jobs.

## Coding Agent CLI and TUI

The Coding Agent CLI adds an interactive shell. The terminal user interface
adds dialogs, editors, notifications, and session controls.

Use the CLI and TUI when an operator must participate during the run. Examples
include these cases:

- The operator must inspect a proposal.
- The operator must approve a transition.
- The worker must ask for missing information.
- The operator must debug or resume a run.

Do not use the CLI as the normal machine-to-machine worker protocol. Use the
programmatic SDK for unattended work.

## Pi extensions

A Pi extension adds a domain composition to Coding Agent. It can add tools,
hooks, prompts, resources, and operator controls.

Use an extension when the same composition must work in headless and
interactive sessions. Keep factory authority outside the extension.

Crust is an exception with a clear reason. Crust runs inside the CLI because it
uses the Pi terminal user interface as an operator workbench. The Crust kernel
still keeps durable workflow authority outside the model.

## Selection rules

Use this order for each factory task:

1. Use deterministic code when deterministic code can do the task.
2. Use Agent Core for a narrow, non-coding agent worker.
3. Use the Coding Agent SDK for a software worker.
4. Add the CLI and TUI only when an operator must join the run.
5. Keep evaluation and promotion in the factory control plane.

Do not select a larger Pi layer only for convenience. Select the smallest layer
that supplies the necessary behavior.

## Application to current examples

### Poducer

The package drafter and reviewer are narrow structured workers. Agent Core is a
good conceptual fit for these workers.

The current Coding Agent SDK still supplies useful model authentication,
session setup, and extension support. These benefits can justify the larger
layer until the factory supplies equivalent shared services.

The image worker uses the `pi-imagegen` extension and Pi authentication. The
Coding Agent SDK is a sensible fit for this worker.

See the [Poducer case study](./poducer-case-study.md) for the complete
composition and pinned source evidence.

### Hello World

Agent Core is sufficient for the smallest proposal loop. The current Coding
Agent version also demonstrates the composition used by later software workers.

### Dependency upgrade

The remediation worker operates on repository code. The Coding Agent SDK is the
natural fit. The parent workflow must continue to own verification and
acceptance.

### Crust

Crust needs interactive proposal review and session replacement. The Coding
Agent CLI and TUI are the correct outer layer for this experiment.

## Small probe

Define one common worker contract:

```text
run(intent, context, capabilities, budget)
  -> proposal, evidence, execution identity
```

Implement two adapters:

- An Agent Core adapter for a narrow domain worker.
- A Coding Agent SDK adapter for a repository worker.

Run both adapters under one control plane. Keep evaluation and receipts the
same. Compare setup cost, isolation, evidence quality, and recovery behavior.

## Writing note

This document uses the main writing principles in ASD-STE100 Issue 9. It uses
short sentences, active voice, consistent terms, and vertical lists. It is not
a certified ASD-STE100 compliance assessment.

See the [official ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).
