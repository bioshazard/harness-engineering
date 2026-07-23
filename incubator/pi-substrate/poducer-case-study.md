# Poducer case study

> Source: [`Build-It-Faster/poducer`](https://github.com/Build-It-Faster/poducer)
> at commit
> [`9b31fa8`](https://github.com/Build-It-Faster/poducer/tree/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a).
> This note records one useful composition. It does not make Poducer a template
> for all software factories.

## Question

How can a host workflow use Pi for several bounded agent tasks without giving
Pi authority over the complete workflow?

## Why Poducer is useful

Poducer is a working transcript-to-publishing workflow. It uses separate Pi
sessions to draft a package, review the package, and generate images.

The host program owns the workflow. It controls the order of work, the revision
budget, deterministic evaluation, artifact production, and the terminal
result.

This separation makes Poducer a useful reference for a Pi-based software
factory worker stack.

## Composition

```text
Bun host workflow
  load transcript and guidance
  draft worker
    @earendil-works/pi-coding-agent SDK
      in-memory Pi session
      submit_package extension tool
      Pi agent runtime
  deterministic package evaluation
  review worker
    @earendil-works/pi-coding-agent SDK
      separate in-memory Pi session
      submit_review extension tool
      Pi agent runtime
  host reaction
    accept, revise, or reject
  image workers
    @earendil-works/pi-coding-agent SDK
      separate in-memory Pi session for each image
      pi-imagegen extension tool
      Pi agent runtime
  deterministic image optimization
  artifact and receipt production
```

Poducer does not start the Pi CLI. It does not use the Pi terminal user
interface. It embeds Coding Agent through `createAgentSession()`.

## Host workflow

The package runner is the outer control layer. It loads inputs, starts workers,
evaluates proposals, controls revisions, generates artifacts, and writes the
receipt.

See the pinned
[`package-run.ts`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/package-run.ts).

An XState machine records the permitted workflow states. The host code still
selects and performs each transition.

See the pinned
[`machine.ts`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/machine.ts).

## Draft worker

The draft worker creates an isolated Coding Agent session. The session has one
active tool: `submit_package`.

An inline Pi extension captures one structured proposal. The extension stops
the session after the tool result. The host then evaluates the proposal.

See
[`PiSubmitPackageExecutor`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/executor.ts#L184-L256).

## Review worker

The review worker uses a new Coding Agent session. It does not continue the
draft conversation.

The session has one active tool: `submit_review`. The tool returns an `accept`,
`revise`, or `reject` proposal. The host interprets that proposal and selects
the next workflow transition.

See
[`PiSubmitReviewExecutor`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/executor.ts#L258-L330).

## Image worker

The image worker also creates an isolated Coding Agent session. It loads the
`pi-imagegen` extension and activates only the `imagegen` tool.

The host starts image work only after deterministic evaluation and review
acceptance. The host then checks the output file and performs deterministic
image optimization.

See
[`PiImageGenerator`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/executor.ts#L332-L394).

## Authentication and model selection

The default workers use the `openai-codex` provider and the user's existing Pi
authentication. Draft and review workers can use OpenRouter instead.

Both paths still use the Coding Agent SDK. The provider changes, but the worker
contract does not change.

See the pinned
[`executor factories`](https://github.com/Build-It-Faster/poducer/blob/9b31fa87bdb2462798d3cf3e7f52b73a40d18d4a/src/poducer-agent/executor.ts#L396-L438).

## What to reuse

Reuse these decisions when they fit the new system:

- Keep the workflow state outside the agent session.
- Give each worker one bounded task.
- Give each worker only the necessary tools.
- Capture structured output through an explicit proposal tool.
- Use a separate session for a separate worker role.
- Perform deterministic checks before expensive model review.
- Let the host select the next transition.
- Record model identities, input hashes, phases, and artifact hashes.

These decisions let the host replace a worker without changing workflow
authority.

## What not to copy by default

Do not copy these Poducer details unless the new problem requires them:

- The transcript and publishing domain.
- The draft-review-image phase order.
- The three-attempt revision budget.
- The three publishing variants.
- XState or Effect as required dependencies.
- The selected providers and models.
- The exact proposal schemas.

These details belong to Poducer. They are not requirements of a Pi-based
factory.

## How to use this reference

Use this case study when a project needs a headless Pi worker inside a larger
host workflow.

A project note can say:

> Build the worker as a bounded, in-memory Coding Agent session. Follow the
> composition in the [Poducer case study](./poducer-case-study.md). Keep workflow
> state, evaluation, and terminal authority in the host.

Use the [Pi substrate note](./README.md) to select Agent Core, the Coding Agent
SDK, or the Coding Agent CLI and TUI.
