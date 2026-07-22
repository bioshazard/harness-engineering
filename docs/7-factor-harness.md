# The 7 Factor Harness

The 7 Factor Harness is an engineering doctrine for recognizing and reviewing
goal harnesses. It is deliberately smaller than the ontology: the factors
preserve the important distinctions without prescribing one architecture.

> Terminology note: [Goal-System Engineering](../incubator/goal-system-engineering/README.md)
> provisionally calls the governed object below a **Goal System** and reserves
> model harness for model-local composition. This historical filename and
> doctrine remain canonical until that migration is accepted.

```text
A goal harness is a bounded pursuit of Intent
in which Executor Proposals require authority before Effect,
independent Observation is evaluated,
Reaction steers progression,
and a Receipt binds the resulting evidence.
```

## 1. Terminality before activity

Define the conditions under which a bounded Harness Run is done, failed,
blocked, exhausted, or superseded. A sustaining system may continue
indefinitely; each run still needs a stop, checkpoint, or continuation
predicate.

Without terminality, the system produces motion rather than accountable
progress.

## 2. State before context

State is the world a Harness Run may affect and observe. Context is the
projection of that State, history, and guidance presented to one Executor.

```text
State   = authoritative world under pursuit
Context = selected view for a particular decision
```

A harness should preserve authoritative State while projecting only the
Context needed for the next Proposal. Dumping all available State into Context
obscures relevance, authority, and provenance.

## 3. Boundaries before capabilities

Every Capability needs an operating envelope:

```text
scope
permissions
sandbox
budget
protected surfaces
approval thresholds
```

The Executor emits a Proposal. A Guard decides whether the relevant Principal,
Capability, and State resource are authorized. Only an allowed Proposal may
produce an Effect.

A tool without a boundary is ambient power.

## 4. Control outside the worker

The Executor proposes transitions. The harness owns progression:

```text
loop
branch
retry
delegate
rollback
stop
escalate
```

The Executor may recommend a next action, but it must not secretly own the
state machine that determines whether work continues.

## 5. Evaluation outside the producer

The producer of an Effect must not be its sole judge. The harness obtains an
independently authoritative Observation, then an Evaluator compares that
evidence with the Intent.

```text
tests
checks
reviewers
metrics
goldens
private evaluations
human judgment
```

“Outside” describes authority, not deployment. Evaluation may run in the same
process when its evidence and verdict do not depend on the Executor's claim.

Guards and Evaluators remain distinct: a Guard authorizes before Effect; an
Evaluator judges Observation after Effect.

## 6. Steering from judgment

Evaluation matters when Reaction changes what happens next:

```text
allow
block
retry
rollback
reframe
split
escalate
stop
promote
```

Evaluation without Reaction is measurement. Reaction without evidence is blind
automation.

## 7. Receipts for improvement

Consequential transitions and bounded runs should leave useful evidence:

```text
Intent
Context identity
Proposal
artifact or Effect
Observation
evaluation result
Reaction
authority decision
cost and time
```

A Receipt binds this evidence for audit, replay, debugging, and trust. It can
also support later harness optimization, but improvement requires a separate
learning process; evidence does not improve steering by itself.

## Compact doctrine

```text
1. Know done.
2. Preserve State.
3. Bound power.
4. Own control.
5. Judge independently.
6. Steer from judgment.
7. Leave useful evidence.
```

## How to use 7FH

Use the factors as review questions:

1. What makes this Harness Run terminal?
2. Which State is authoritative, and which Context is projected?
3. Which Principal may use which Capability on which resource?
4. Who owns progression and branching?
5. Is Evaluation independently authoritative?
6. Can its verdict steer the next transition?
7. Does the Receipt bind enough evidence to explain the outcome?

7FH is not a replacement for the ontology. The ontology names the roles and
relationships earned by executable examples. 7FH is the compact engineering
discipline used to inspect whether those roles remain intact in a design.
