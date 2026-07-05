# Goal-System Engineering

> Status: terminology proposal. This note does not rename the repository,
> doctrine, ontology, examples, or code. Executable evidence and external usage
> should test the distinction first.

## The naming problem

Current industry usage increasingly defines **harness engineering** around the
model or agent:

```text
model
→ guides
→ Context
→ tools and permissions
→ sensors
→ agent behavior
```

Birgitta Böckeler describes harness engineering in this model-local sense for
coding-agent users. She treats guides as feedforward controls and sensors as
feedback controls, and she notes that nested harnesses strain the metaphor.
Her bounded-context qualification matters: “harness” now usually names the
system around a model or agent, not every control system that contains one.

See [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html).

This repository studies a broader object. Its examples govern a bounded
pursuit of Intent across models, deterministic code, MCP mechanisms, humans,
and recursively composed runs. Calling every layer a harness obscures which
thing the system regulates.

Use two terms:

```text
harness engineering
  model-local regulation

goal-system engineering
  outcome-local governance
```

## Canonical object

A **Goal System** is:

> A bounded control system that pursues Intent by authorizing Capabilities,
> independently observing and evaluating State, and steering subsequent
> transitions, while leaving evidence sufficient to explain the outcome.

The compact control shape remains:

```text
Intent
→ bounded State
→ Context
→ Executor Proposal
→ authority decision
→ Capability
→ Effect
→ independent Observation
→ Evaluation
→ Reaction
→ next transition or terminal verdict
→ Receipt
```

“Independent” describes authority, not deployment. An evaluator may run in the
same process as an Executor when it derives its verdict from evidence that does
not depend on the Executor’s claim.

A Receipt does not improve the system by itself. It supports audit, debugging,
trust, and a separate learning process that may publish a new Goal System
version.

## Goal System versus model harness

A model harness regulates a worker:

```text
model harness =
  prompts
  guides
  selected Context
  tools
  permissions
  memory
  model-facing sensors
  self-correction loop
```

A Goal System governs an outcome:

```text
Goal System =
  Intent
  authoritative State
  transition authority
  bounded Capabilities
  Observation
  Evaluation
  Reaction
  terminality
  Receipts
```

A Goal System may contain no model. It may use deterministic workers or humans.
It may also compose several model-harnessed agents. Replacing one worker does
not change the parent’s control responsibility.

The email example exposes the distinction:

```text
draft-only MCP
  supplies narrow read and draft mechanisms

drafter model harness
  guides one model to produce a candidate reply

review-and-send Goal System
  uses review evidence to revise, reject, escalate, or authorize one exact send
```

The parent still exists if a human drafts or reviews the email. Therefore the
parent is not a model harness.

## Seven factors of Goal-System Engineering

The existing seven factors describe Goal Systems more precisely than model
harnesses:

1. Terminality before activity.
2. State before Context.
3. Boundaries before Capabilities.
4. Control outside the worker.
5. Evaluation outside the producer.
6. Steering from judgment.
7. Receipts for improvement.

Do not abbreviate this to “7FGS” yet. Let executable examples and external use
establish the terminology before creating another brand.

## Relationship to intent engineering

Nate B. Jones defines **intent engineering** as making organizational purpose,
goals, values, tradeoffs, and decision boundaries machine-readable and
machine-actionable. His progression is:

```text
prompt engineering  → tells AI what to do
Context engineering → tells AI what to know
intent engineering  → tells AI what to want
```

See [The missing layer is what I’m calling intent engineering](https://natesnewsletter.substack.com/p/klarna-saved-60-million-and-broke).

Intent engineering supplies goal semantics. Goal-system engineering turns
those semantics into governed transitions.

Intent semantics affect every control role:

- Terminality defines success and exhaustion.
- State identifies what matters enough to preserve and observe.
- boundaries encode prohibitions and tradeoffs.
- Evaluation compares evidence against desired outcomes.
- Reaction resolves conflict and uncertainty.
- authority determines who may approve exceptions and consequences.
- Receipts retain evidence of alignment and deviation.

Do not reduce intent engineering to terminality plus steering. Treat it as an
upstream, cross-cutting input to the whole Goal System.

```text
intent without Evaluation = aspiration
intent without Reaction   = dashboard
intent without authority  = advice
intent without Receipts   = folklore
intent without bounded State = ideology
```

## System topology

Avoid presenting these concerns as one strictly linear stack. Use a nested
topology:

```text
Intent semantics ───────────────┐
                               ▼
model → model harness → worker → Goal System
                               │
                               ├─ composes child Goal Systems
                               └─ may constitute a domain factory

Receipts → separate optimizer → new versioned Intent, Policy, or composition
```

A domain factory is usually a macro Goal System, not merely a layer above one.
A Goal System optimizer runs a separate learning loop. It consumes Receipts
and other evidence, evaluates system behavior across runs, and proposes or
publishes a new immutable system version.

## Scale

Micro, meso, and macro describe where Goal-System control lives:

```text
micro
  governs one bounded transition

meso
  uses child evidence to select the next bounded transition

macro
  governs durable, recurring production and promotion
```

Feature count does not determine scale. RAG, MCP servers, multiple models, or
many integrations may serve one micro or meso Goal System. Durable intake,
lineage, promotion, recovery, institutional Policy, and cross-run operation
create macro pressure.

## Pressure test

Call something a Goal System only when operational pressure requires the
control anatomy.

Ask:

1. Does the system pursue a bounded Intent?
2. Does it preserve authoritative State separately from worker Context?
3. Does authority govern consequential transitions?
4. Does independently authoritative evidence determine success?
5. Can Evaluation change what happens next?
6. Does the system own terminality outside the worker?
7. Can a Receipt explain the exact outcome?

If a narrow function, MCP interface, or model harness satisfies the pressure,
build that smaller thing. Do not add Goal-System machinery to complete a
taxonomy.

## Proposed terminology

Use this vocabulary provisionally:

```text
model harness
  model-local guides, sensors, Context, tools, and permissions

Executor
  a worker that interprets Intent or delegated Context and emits Proposals

Goal System
  the outcome-local control system governing a bounded pursuit

goal-system engineering
  the discipline of designing, implementing, evaluating, and improving Goal
  Systems

domain factory
  a macro Goal System that repeatedly produces and promotes domain artifacts

Goal System optimizer
  a separate learning system that uses cross-run evidence to publish improved
  Goal System versions
```

Retire **meta harness** except when discussing optimization of an actual
model-local harness.

## Decision deferred

This terminology fits the repository’s current executable evidence, but a
repository-wide rename would affect the vision, doctrine, ontology, examples,
paths, and public identity.

Before refactoring:

1. test the terms against every existing example;
2. identify which current “Harness Run” uses actually mean “Goal System Run”;
3. preserve “model harness” where the model-local meaning applies;
4. decide whether the seven factors govern all Goal Systems or only
   model-mediated ones;
5. check for established conflicting uses of “goal system”; and
6. write one migration decision that maps old terms to new terms without
   rewriting historical evidence.

Treat the rename as a model migration, not a search-and-replace.
