# Draft-Only Email Authority

An email provider may grant one credential broad mailbox read/write authority.
That does not imply an Executor should receive it.

This micro harness proves a narrower proposition:

> Given one user-selected thread, create exactly one unsent reply draft while
> making every other mailbox mutation unavailable.

## Why this remains micro

The run has one Intent, one projected mutation Capability, and one terminal
Evaluation. Several checks do not make it meso. No child Receipt selects a
subsequent Harness Run.

```text
selected thread
→ projected Context
→ Executor Proposal
→ Guard
→ create reply draft | block
→ independent mailbox Observation
→ accept | reject
```

Classification followed by draft, decline, or human-input child runs would be
meso. That composition is deliberately deferred.

## State is not Context

Mailbox State contains selected and unrelated messages, existing drafts,
labels, sent-mail history, and broad provider operations. The Executor receives
only a Context projection:

- the selected thread content;
- reply recipient and subject Policy;
- draft Intent;
- one-Proposal and body-size budgets; and
- explicit attachment/send prohibitions.

It receives no credential, unrelated mailbox data, discovery operation, or raw
provider adapter. This makes Context a privacy and authority control, not a
prompt convenience.

## Narrow interface, broad implementation

The in-memory mailbox intentionally implements broad operations: draft, send,
archive, delete, and label. The Executor never sees that interface. A broker
holds the broad adapter and satisfies one deep harness interface:

```text
createReplyDraft(proposal) → reported draft identity
```

The Guard independently requires:

- exactly one Proposal;
- the selected source thread;
- exact Policy-derived recipients;
- exact reply subject;
- bounded UTF-8 body; and
- the sole `create_reply_draft` operation.

Send, recipient change, arbitrary thread access, and a second Proposal fail
closed.

“Broker” and “projection” describe implementation and design. The executable
evidence does not require new ontology nouns for them.

## Independent terminality

Provider success is not acceptance. After the Effect, the Evaluator compares
independent before/after mailbox snapshots and an append-only mutation log.

Acceptance requires:

- exactly one new draft;
- unsent State;
- selected-thread reply relationship;
- exact recipients and subject;
- no attachments;
- unchanged sent-mail State;
- unchanged unrelated messages, labels, and pre-existing drafts; and
- exactly one `draft.create` mutation.

A lying backend that reports draft creation while archiving an unrelated
message is rejected. An allowed Proposal that produces the wrong recipient is
also rejected.

## Sensitive evidence

The Executor must see message content to write a useful draft. The Receipt must
not retain it. Receipt evidence contains hashes, byte counts, operation names,
verdicts, and redacted mutation identities. Tests assert that source body,
draft body, and recipient addresses do not appear in serialized Receipts.

This distinction is important:

```text
necessary Executor Context ≠ durable Receipt content
```

## What the mock proves

Eight deterministic scenarios establish valid drafting, unavailable sending,
recipient and thread guards, Proposal exhaustion, hidden unrelated mutation
detection, attachment denial, and terminal State mismatch rejection.

The mock does not prove provider behavior, OAuth scope safety, race resistance,
or production privacy. It proves the control shape before risking a mailbox.

## Deferred

Provider integration, inbox search, autonomous selection, classification,
prioritization, multiple messages, sending, scheduling, attachments, durable
resume, provider-general interfaces, meso composition, and macro operation.

- [Run the lab](./lab/README.md)
- [Canonical ontology](../hello-world/docs/ontology.md)
