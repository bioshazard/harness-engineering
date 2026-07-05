# MCP Is Not a Harness

> Status: working distinction derived from the draft-only email discussion.
> It should be tested against a real MCP integration before entering the
> ontology.

MCP and harnesses solve different problems.

An MCP server presents Context and Capabilities through a standard protocol. A
harness governs a bounded pursuit of Intent by controlling authority,
Observation, Evaluation, Reaction, terminality, and evidence.

```text
MCP:     what mechanism can the Executor invoke?
Harness: under what authority, toward which Intent, with what judgment and
         consequence does progression occur?
```

Neither implies the other. A harness may use MCP, direct function calls, shell
processes, humans, or other mechanisms. An MCP server may be a narrow tool
adapter without owning any Harness Run.

## A narrow MCP may be enough

Suppose an email provider issues a credential with broad mailbox read/write
authority. A trusted MCP server can retain that credential while exposing only:

```text
read_thread(thread_id)
create_reply_draft(thread_id, body)
```

The server can derive recipients and reply subject from the selected thread.
It need not accept recipient, attachment, send, delete, archive, label, search,
or arbitrary mailbox-operation inputs. Those operations should not merely be
discouraged in a prompt; they should be absent from the Executor-visible tool
surface.

```text
broad provider credential
→ trusted narrow MCP server
→ explicit thread read + unsent draft creation
→ Executor
```

This is useful capability design. It does not become a harness merely because
the credential behind the server is more powerful than the tools in front of
it.

The pressure here is least privilege:

> The Executor must be unable to invoke email operations beyond explicit reads
> and unsent draft creation.

A purpose-built MCP server satisfies that pressure without requiring a run
state machine, evaluator, Reaction, or Receipt.

## Tool verification is not automatically harness Evaluation

The draft tool may strengthen its result by reading the created object back
from the provider:

```json
{
  "draft_id": "provider identity",
  "thread_id": "selected thread identity",
  "status": "draft",
  "verified_unsent": true
}
```

This is better than returning the write call's success claim. The server has
performed read-after-write verification against provider State.

It is still a tool result produced by the same trusted module that performed
the Effect. Whether that is sufficient depends on the claim:

- For “this MCP operation created an unsent draft,” provider readback inside
  the MCP server may be sufficient.
- For “this Harness Run satisfied its Intent,” the harness still needs an
  Observation and Evaluator with authority independent of the Executor's claim.
- For “the MCP server itself cannot misbehave,” self-verification is
  insufficient; a separate trust mechanism or observer is required.

“Independent” describes authority, not necessarily deployment. A harness may
call a read operation on the same provider after the draft tool returns. What
matters is that success is not inferred solely from the Executor or write
operation saying it succeeded.

Do not introduce independent Evaluation when the actual pressure only requires
a trusted narrow mechanism. That would add harness machinery without earning
it.

## The email pressure that earns a harness

Draft creation becomes harness-shaped when the system may progress into the
consequential act of sending.

```text
draft transition
→ independently read draft
→ review transition
→ approve | revise | reject
→ guarded send transition
→ independently observe sent message
→ parent Receipt
```

The new pressure is not that another email tool exists. It is that evidence
must determine whether authority for a consequential next transition is
granted.

The MCP servers still provide mechanisms:

```text
read thread
create draft
read draft
send exact approved draft
read sent message
```

The parent harness owns:

- the outcome Intent;
- which bounded transition occurs next;
- revision and attempt budgets;
- the reviewed draft identity;
- authority to send that exact draft once;
- the acceptance or rejection verdict;
- terminality; and
- the parent Receipt.

The send Guard should bind authority to the reviewed draft hash and exact
recipients. Post-send Observation should confirm provider sent State and that
the sent content matches the approved artifact. Draft creation, content
approval, send authority, and sent-State verification remain distinct.

## LLM review does not silently grant authority

An LLM judge may evaluate tone, factual consistency, policy compliance, or
prompt-injection risk. That verdict can become parent Observation.

It should not silently grant itself send authority. Policy must state whether:

- a human must approve;
- deterministic checks plus a judge verdict are sufficient;
- a particular judge identity and threshold are required; or
- uncertainty requires revision or escalation.

Using a second model does not automatically make Evaluation authoritative.
Model identity, Context, criteria, evidence, and the authority attached to its
verdict must remain explicit.

## Why the send workflow is meso

Scale is determined by where control lives, not by feature count.

The draft-review-send workflow is meso because one bounded parent control
system evaluates transition evidence and selects a genuinely different next
transition:

```text
review verdict
├─ approve → send
├─ revise  → bounded redraft
├─ reject  → terminate
└─ unsure  → human input
```

Drafting alone may remain one MCP invocation. A fixed sequence of draft,
review, and send is only a pipeline. The flow demonstrates meso behavior when
the parent evaluates child evidence and owns the branch.

## Why it is not macro

Standards, integrations, and retrieval do not determine harness scale. RAG may
inform one micro Executor, and a dozen integrations may still serve one bounded
meso run.

The email system becomes macro when it governs durable, recurring production:

- ongoing mailbox intake;
- durable queues and checkpoints;
- many concurrent message Runs;
- organizational policy and escalation;
- monitoring, recovery, and operational ownership;
- cross-run learning or tuning; and
- promotion of changing standards and knowledge into active operation.

One reviewed-and-sent email is meso. A sustained system managing email work is
macro.

## Pressure test

Before adding harness machinery around an MCP tool, ask:

1. Is the pressure satisfied by removing operations or inputs from the MCP
   interface?
2. Is provider read-after-write verification sufficient for the claim?
3. Must evidence change which consequential transition occurs next?
4. Does some authority other than the Executor need to determine success?
5. Is there a bounded Intent and terminal verdict that needs a Receipt?

If only the first two answers are yes, build a deep MCP module.

If the latter three become necessary, a harness has been earned.

## Current conclusion

The draft-only email idea, as currently stated, is an MCP design problem:
retain a broad provider credential behind a server and expose only explicit
thread reads and verified unsent draft creation.

The executable [`email-review-send`](../../poc/email-review-send/README.md)
example demonstrates the draft-review-send meso Goal System:
review evidence authorizes revision, rejection, escalation, or one exact send,
and independent sent-State Observation determines the parent verdict.

Do not call the first a harness to make the taxonomy feel complete. Do not call
the second “just MCP” merely because MCP supplies its tools. The distinction is
earned by operational pressure.
