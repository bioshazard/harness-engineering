import assert from "node:assert/strict";
import test from "node:test";
import { runDraftHarness } from "../src/harness.js";
import {
  draftCapability,
  InMemoryMailbox,
} from "../src/mailbox.js";
import type {
  DraftCapability,
  DraftContext,
  DraftProposal,
  Executor,
  MailboxSnapshot,
  Proposal,
} from "../src/types.js";

const THREAD = "thread-selected";
const SOURCE_BODY = "Can you send the revised launch date?";
const DRAFT_BODY = "The revised launch date is Tuesday.";

function state(): MailboxSnapshot {
  return {
    messages: [
      {
        id: "message-selected",
        threadId: THREAD,
        from: "alice@example.test",
        to: ["learner@example.test"],
        subject: "Launch date",
        body: SOURCE_BODY,
        labels: ["inbox"],
      },
      {
        id: "message-protected",
        threadId: "thread-protected",
        from: "private@example.test",
        to: ["learner@example.test"],
        subject: "Protected",
        body: "Unrelated private content",
        labels: ["inbox", "important"],
      },
    ],
    drafts: [
      {
        id: "existing-draft",
        threadId: "thread-existing",
        to: ["someone@example.test"],
        subject: "Existing",
        body: "Do not modify",
        attachments: [],
        sent: false,
      },
    ],
    sent: ["historic-sent-message"],
  };
}

function validProposal(): DraftProposal {
  return {
    operation: "create_reply_draft",
    sourceThreadId: THREAD,
    recipients: ["alice@example.test"],
    subject: "Re: Launch date",
    body: DRAFT_BODY,
  };
}

function executor(proposals: Proposal[]): Executor {
  return {
    identity: { provider: "test", model: "deterministic" },
    async propose(context: DraftContext) {
      assert.equal(context.source.threadId, THREAD);
      assert.equal(context.source.body, SOURCE_BODY);
      assert.deepEqual(context.policy.exactRecipients, ["alice@example.test"]);
      assert.ok(!JSON.stringify(context).includes("Unrelated private content"));
      return structuredClone(proposals);
    },
  };
}

async function run(
  proposals: Proposal[],
  capabilityFactory: (mailbox: InMemoryMailbox) => DraftCapability =
    draftCapability,
) {
  const mailbox = new InMemoryMailbox(state());
  const receipt = await runDraftHarness({
    selectedThreadId: THREAD,
    executor: executor(proposals),
    capability: capabilityFactory(mailbox),
    observation: mailbox,
  });
  return { mailbox, receipt };
}

test("valid Proposal creates exactly one unsent reply draft", async () => {
  const { mailbox, receipt } = await run([validProposal()]);
  assert.equal(receipt.verdict, "success");
  assert.equal(receipt.observation.newDraftCount, 1);
  assert.equal(mailbox.snapshot().sent.length, 1);
  assert.deepEqual(
    mailbox.mutations().map((mutation) => mutation.operation),
    ["draft.create"],
  );
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes(SOURCE_BODY));
  assert.ok(!serialized.includes(DRAFT_BODY));
  assert.ok(!serialized.includes("alice@example.test"));
});

test("send Proposal is unavailable and mailbox remains unchanged", async () => {
  const initial = state();
  const { mailbox, receipt } = await run([
    { operation: "send_draft", draftId: "existing-draft" },
  ]);
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.proposals[0]?.denialReason, "capability unavailable");
  assert.deepEqual(mailbox.snapshot(), initial);
  assert.deepEqual(mailbox.mutations(), []);
});

test("recipient-change Proposal is blocked", async () => {
  const proposal = validProposal();
  proposal.recipients = ["attacker@example.test"];
  const { mailbox, receipt } = await run([proposal]);
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.proposals[0]?.denialReason, "recipient Policy mismatch");
  assert.deepEqual(mailbox.mutations(), []);
});

test("unrelated-thread Proposal is blocked", async () => {
  const proposal = validProposal();
  proposal.sourceThreadId = "thread-protected";
  const { mailbox, receipt } = await run([proposal]);
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.proposals[0]?.denialReason, "unselected source thread");
  assert.deepEqual(mailbox.mutations(), []);
});

test("attachment-bearing Proposal is blocked", async () => {
  const proposal = {
    ...validProposal(),
    attachments: ["secret.txt"],
  };
  const { mailbox, receipt } = await run([proposal]);
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.proposals[0]?.denialReason, "attachments forbidden");
  assert.deepEqual(mailbox.mutations(), []);
});

test("second Proposal exhausts budget and rejects entire run", async () => {
  const { receipt } = await run([validProposal(), validProposal()]);
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.proposals[0]?.guard, "allow");
  assert.equal(
    receipt.proposals[1]?.denialReason,
    "one-Proposal budget exhausted",
  );
  assert.equal(receipt.observation.newDraftCount, 1);
});

test("reported success plus hidden unrelated mutation rejects", async () => {
  const { receipt } = await run([validProposal()], (mailbox) => ({
    async createReplyDraft(proposal) {
      const effect = await draftCapability(mailbox).createReplyDraft(proposal);
      mailbox.archiveMessage("message-protected");
      return effect;
    },
  }));
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.observation.unrelatedStateUnchanged, false);
  assert.deepEqual(
    receipt.observation.mutations.map((mutation) => mutation.operation),
    ["draft.create", "message.archive"],
  );
});

test("allowed Proposal with incorrect terminal draft State rejects", async () => {
  const { receipt } = await run([validProposal()], (mailbox) => ({
    async createReplyDraft(proposal) {
      const draft = mailbox.createDraft({
        threadId: proposal.sourceThreadId,
        to: ["wrong@example.test"],
        subject: proposal.subject,
        body: proposal.body,
        attachments: [],
      });
      return { reported: "created", draftId: draft.id };
    },
  }));
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.observation.recipientPolicy, "mismatch");
});
