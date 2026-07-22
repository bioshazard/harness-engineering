---
name: harness-engineering
description: Design, review, and explain accountable goal harnesses and Goal Systems. Use when Codex needs to distinguish harnesses from scripts, tools, MCP servers, pipelines, or model wrappers; derive micro/meso/macro control boundaries; define Intent, State, Context, Proposal, Guard, Capability, Effect, Observation, Evaluator, Reaction, Receipt, Principal, Grant, and Policy; or assess whether a workflow has terminality, authority, independent evaluation, evidence-driven steering, and useful receipts.
---

# Harness Engineering

Use this skill to preserve the distinctions earned by the executable textbook. Do not add harness machinery because it sounds architectural. Add it only when a concrete pressure requires authority, observation, evaluation, steering, terminality, or evidence.

## Core Model

A goal harness is a bounded pursuit of Intent in which Executor Proposals require authority before Effect, independent Observation is evaluated, Reaction steers progression, and a Receipt binds the evidence.

Micro flow:

```text
Intent -> Context -> Executor -> Proposal -> Guard
  -> Capability -> Effect -> Observation -> Evaluator
  -> Reaction -> Receipt
```

Irreducible distinctions:

```text
intent != proposal
proposal != authorization
authorization != effect
effect != observation
observation != success
success != evidence
```

Authority shape:

```text
authority = Principal x Capability x State resource
```

Use these terms precisely:

- Intent: desired State condition.
- State: authoritative world the run may affect and observe.
- Context: selected projection of State, history, and guidance for one Executor.
- Executor: model-driven runtime that emits Proposals.
- Proposal: requested Capability invocation; not yet an Effect.
- Guard: pre-effect authority decision.
- Capability: operation that may change State.
- Effect: State change caused by an authorized Capability.
- Observation: evidence about State independent of Executor self-report.
- Evaluator: post-effect judgment comparing Observation with Intent.
- Reaction: harness response: allow, block, retry, rollback, reframe, split, escalate, stop, promote.
- Receipt: structured evidence explaining outcome.
- Principal: actor whose authority is evaluated.
- Grant: permission for one Principal to use one Capability on one State resource.
- Policy: immutable Grants consulted during one run.

Implementation names are not ontology. Do not treat Pi, OpenRouter, MCP, shell, filesystem, JSON stdout, or a specific framework as harness roles.

## 7-Factor Review

Ask these before accepting a design as a harness:

1. Terminality: what makes this run done, failed, blocked, exhausted, or superseded?
2. State before context: which State is authoritative, and what Context is projected?
3. Boundaries before capabilities: which Principal may use which Capability on which resource?
4. Control outside worker: who owns loop, branch, retry, delegate, rollback, stop, escalate?
5. Evaluation outside producer: what Observation is authoritative beyond Executor or tool self-report?
6. Steering from judgment: how can the verdict change the next transition?
7. Receipts for improvement: what evidence explains the outcome and supports audit/replay/debugging?

Compact doctrine:

```text
Know done. Preserve State. Bound power. Own control.
Judge independently. Steer from judgment. Leave useful evidence.
```

## Scale

Scale is where control lives, not repo size, model count, tool count, duration, or importance.

Micro: one bounded transition. Demonstrated when one Intent has terminality, Proposals are authorized before Effect, Observation is independent, Evaluation determines verdict, and a Receipt is emitted.

Meso: evidence-driven workflow governance. Demonstrated when a parent has its own Intent, State, Evaluation, Reaction, and Receipt; consumes stable transition Receipts/artifacts as Observation; and uses evidence to choose next transition.

Macro: durable production and promotion. Demonstrated when immutable composition identity, lineage, custody, promotion authority, rollback/supersession, operational feedback, and promotion-grade evidence govern releases or recurring production.

Composition law:

```text
bounded transition Receipt + referenced artifacts = parent Observation
```

The parent should not need child prompt history, private control flow, or implementation internals. If it does, the child interface or Receipt is too weak.

## Mechanism Versus Harness

MCP, APIs, tools, scripts, and model wrappers are mechanisms. They may be deep modules without being harnesses.

MCP question:

```text
What mechanism can the Executor invoke?
```

Harness question:

```text
Under what authority, toward which Intent, with what judgment and consequence does progression occur?
```

Prefer a narrow mechanism when least privilege solves the pressure. Example: an email MCP server that exposes only `readThread`, `createReplyDraft`, and `readDraft`, derives recipients server-side, omits send, and verifies unsent draft state is a good mechanism module. It becomes harness-shaped only when reviewed evidence can authorize revision, rejection, escalation, or one exact send.

Do not call a fixed sequence a meso harness. Without parent Intent, parent Evaluation, and evidence-driven Reaction, it is a pipeline.

## Design Procedure

1. State the pressure in one sentence.
2. Identify the smallest bounded Intent that makes the pressure observable.
3. Name authoritative State separately from projected Context.
4. Define the Executor-visible Capabilities and remove unnecessary operations/inputs.
5. Specify Principal, Policy, Grants, protected resources, budgets, sandbox, and approval thresholds.
6. Make Executor outputs Proposals, not Effects.
7. Put Guard checks before Effect and fail closed on unknown identity, unknown resource, or unmatched Grant.
8. Observe State after Effect without relying on Executor self-report.
9. Evaluate Observation against Intent.
10. Define Reactions that actually change progression.
11. Emit Receipts with enough evidence to explain verdicts without leaking unnecessary sensitive Context.
12. List non-claims explicitly so future examples earn complexity before naming it.

## Receipt Guidance

Receipts should usually bind:

- Intent or fixture identity.
- Context identity, not necessarily full Context.
- Proposal.
- Principal, Policy identity, matched Grant, or denial reason.
- Capability result and Effect identity.
- Observation and Evaluator verdict.
- Reaction and terminal reason.
- Artifact hashes and references.
- Cost, time, budgets, and executor/composition identities when relevant.

Keep sensitive source bodies, emails, feedback, addresses, secrets, and large artifacts out of durable Receipts when hashes and references suffice.

Content identity should exclude storage location but include artifact hashes.

## Common Failure Modes

- Tool call treated as authority.
- Tool success treated as goal success.
- Executor allowed to own the state machine.
- Evaluator depends only on producer claim.
- Measurement recorded but no Reaction can change behavior.
- Parent rewrites child failure as success.
- Parent depends on child internals instead of stable Receipt/artifact interface.
- Broad credential exposed as broad Executor-visible capability.
- Ambient defaults hidden from composition identity.
- Receipt records everything, including sensitive Context, instead of durable evidence.

## Naming Discipline

Derive before naming. Introduce one conceptual pressure at a time. Record only conclusions already earned by executable examples. Prefer the smallest explanation that preserves the distinction.
