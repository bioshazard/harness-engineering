# Goal Harness Scale Invariance

> Status: working hypothesis. The micro examples support this lens; later
> executable examples must test it.

Goal harness topology appears scale-invariant. The implementation does not
repeat unchanged. The control shape does:

```text
Intent
→ authoritative State snapshot
→ Proposal by a Principal
→ Policy and Guard decision
→ authorized Capability
→ Effect
→ independent Observation
→ Evaluation
→ Reaction
→ Receipt
```

A harness governs intent-conditioned State transitions by separating proposal,
authority, effect, observation, evaluation, and steering, then leaving evidence
that binds them.

Without Evaluation, this is execution. Without steering, it is instrumentation.
Without scoped authority, it is autonomy. Without evidence binding the run to
its governing inputs, it is ungoverned history.

## Recurrence across scales

The same questions recur while their answers grow:

| Concern | Micro | Workflow | Factory or organization |
| --- | --- | --- | --- |
| Intent | local condition | accepted workflow outcome | mission or product mandate |
| State | files and values | run and artifact state | lineage and institutional memory |
| Authority | tool and resource Grant | workflow transition Policy | governance and promotion rights |
| Capability | one operation | services, agents, and humans | production systems and portfolios |
| Observation | readback or return value | traces, tests, and artifacts | operational and business evidence |
| Evaluation | deterministic assertion | judge or review gate | release and fitness review |
| Reaction | stop or fail | retry, patch, replan, escalate | promote, roll back, or deprecate |
| Terminality | done | accepted | released and sustained |

The invariant is not agent, graph, workflow, or state-machine machinery. It is
a steered transition under evaluative and authoritative control.

## Recursive composition

A software factory can be viewed as a recursively composed harness whose
product is validated change:

```text
request
→ specification
→ design
→ implementation
→ tests
→ review
→ release candidate
→ promotion
→ production artifact
→ feedback
```

Each stage may itself be a Harness Run. Composition remains tractable only when
a child exposes a stable parent-facing result: its Intent, Receipt, artifacts,
and verdict. The parent should not need the child's private execution history
to steer its own next transition.

This gives a fractal nesting:

```text
harness inside graph
graph inside run
run inside process
process inside release system
release system inside factory
factory inside organizational strategy
```

## Trust is not scale-invariant

Trust does not grow automatically with the topology. Small examples can rely
on local State, deterministic checks, and cheap reversal. Larger harnesses need
stronger bindings:

- immutable composition releases
- exact run-to-release identity
- authenticated Principals and separated authorities
- typed lineage edges and artifact custody
- segment checkpoints and promotion gates
- durable audit evidence
- replay and rollback semantics

`hello-2-codeauth` demonstrates the pressure without solving the scaled
problem. Its Git email is a Principal label, not authentication. Its immutable
Policy is local to one run. Its symlink defense is a preflight check, not
race-safe isolation. Its model-backed execution is illustrative, not
deterministic. These limitations are evidence that topology can recur while
operational trust must become more explicit.

At promotion scale, a useful Receipt must support a claim of this form:

> This immutable composition, under these contracts and Policies, produced
> this trace and artifact, passed this Evaluation, and was promoted by this
> Gate.

That claim distinguishes harness infrastructure from orchestration alone.

## Design consequence

Do not build a universal harness. Keep a thin generic kernel:

```text
resolve composition
bind immutable identity
initialize State
authorize and execute transition
capture Observation
invoke Evaluator
record Receipt and artifacts
steer, terminate, or escalate
```

Everything else is domain protocol. Every scale should expose the same
questions, not use the same machinery:

- What Intent governs this run?
- What State is authoritative?
- Which transitions and Capabilities are allowed?
- Which Principal proposes or approves them?
- What Observation is independent of the Executor?
- Who or what evaluates it?
- Can that Evaluation steer future transitions?
- What makes the run terminal?
- What evidence binds the result to composition, Policy, and evaluator?
- What can be replayed, promoted, or rolled back?

## Falsification tests

Scale invariance remains a hypothesis until thin, thick, and macro examples
preserve these distinctions without sharing one implementation. Reject or
revise the hypothesis if an executable example shows that:

1. a scale requires a new control role, not merely stronger machinery;
2. recursive composition cannot hide child internals behind Receipts and
   artifacts;
3. authority, Evaluation, or steering cannot be located at that scale; or
4. promotion-grade lineage cannot be expressed as evidence binding existing
   roles.

Until then, scale invariance is a design lens, not an earned ontology term.
