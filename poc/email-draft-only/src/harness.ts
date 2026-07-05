import { createHash } from "node:crypto";
import type {
  Draft,
  DraftCapability,
  DraftContext,
  DraftProposal,
  Executor,
  MailboxSnapshot,
  Mutation,
  ObservationPort,
  Proposal,
} from "./types.js";

const MAX_BODY_BYTES = 8_192;

export function hash(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export type ProposalEvidence = {
  operation: string;
  sourceThreadHash?: string;
  recipientHashes?: string[];
  subjectHash?: string;
  bodyHash?: string;
  bodyBytes?: number;
  guard: "allow" | "block";
  denialReason?: string;
  effect: "created" | "not_run";
  draftIdHash?: string;
};

export type Receipt = {
  intent: {
    action: "create_reply_draft";
    sourceThreadHash: string;
    draftLimit: 1;
    send: "forbidden";
  };
  contextHash: string;
  executor: Executor["identity"];
  proposals: ProposalEvidence[];
  observation: {
    newDraftCount: number;
    unsent: boolean;
    recipientPolicy: "match" | "mismatch";
    replyRelationship: "match" | "mismatch";
    attachments: number;
    sentStateUnchanged: boolean;
    unrelatedStateUnchanged: boolean;
    mutations: { operation: string; resourceHash: string }[];
  };
  reaction: "accept" | "reject";
  verdict: "success" | "failure";
};

function same(value: unknown, other: unknown) {
  return hash(value) === hash(other);
}

function expectedSubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function isDraftProposal(proposal: Proposal): proposal is DraftProposal {
  return (
    proposal.operation === "create_reply_draft" &&
    typeof proposal.sourceThreadId === "string" &&
    Array.isArray(proposal.recipients) &&
    proposal.recipients.every((recipient) => typeof recipient === "string") &&
    typeof proposal.subject === "string" &&
    typeof proposal.body === "string"
  );
}

function proposalEvidence(proposal: Proposal): ProposalEvidence {
  if (!isDraftProposal(proposal)) {
    return {
      operation: proposal.operation,
      guard: "block",
      denialReason: "capability unavailable",
      effect: "not_run",
    };
  }
  return {
    operation: proposal.operation,
    sourceThreadHash: hash(proposal.sourceThreadId),
    recipientHashes: proposal.recipients.map(hash),
    subjectHash: hash(proposal.subject),
    bodyHash: hash(proposal.body),
    bodyBytes: Buffer.byteLength(proposal.body),
    guard: "block",
    effect: "not_run",
  };
}

function authorize(
  proposal: Proposal,
  context: DraftContext,
  proposalNumber: number,
): { verdict: "allow" } | { verdict: "block"; reason: string } {
  if (proposalNumber !== 1) {
    return { verdict: "block", reason: "one-Proposal budget exhausted" };
  }
  if (!isDraftProposal(proposal)) {
    return { verdict: "block", reason: "capability unavailable" };
  }
  if (proposal.sourceThreadId !== context.source.threadId) {
    return { verdict: "block", reason: "unselected source thread" };
  }
  if (!same(proposal.recipients, context.policy.exactRecipients)) {
    return { verdict: "block", reason: "recipient Policy mismatch" };
  }
  if (proposal.subject !== context.policy.exactSubject) {
    return { verdict: "block", reason: "reply subject mismatch" };
  }
  if ("attachments" in proposal) {
    return { verdict: "block", reason: "attachments forbidden" };
  }
  if (Buffer.byteLength(proposal.body) > context.policy.maxBodyBytes) {
    return { verdict: "block", reason: "body byte budget exceeded" };
  }
  return { verdict: "allow" };
}

function unrelatedStateUnchanged(
  before: MailboxSnapshot,
  after: MailboxSnapshot,
  newDrafts: Draft[],
) {
  return (
    same(before.messages, after.messages) &&
    same(before.sent, after.sent) &&
    same(before.drafts, after.drafts.filter(
      (draft) => !newDrafts.some((created) => created.id === draft.id),
    ))
  );
}

export async function runDraftHarness(input: {
  selectedThreadId: string;
  executor: Executor;
  capability: DraftCapability;
  observation: ObservationPort;
}): Promise<Receipt> {
  const before = input.observation.snapshot();
  const source = before.messages.find(
    (message) => message.threadId === input.selectedThreadId,
  );
  if (!source) throw new Error("selected source thread not found");
  const context: DraftContext = {
    intent: "draft_reply",
    source: {
      threadId: source.threadId,
      from: source.from,
      to: [...source.to],
      subject: source.subject,
      body: source.body,
    },
    policy: {
      exactRecipients: [source.from],
      exactSubject: expectedSubject(source.subject),
      maxBodyBytes: MAX_BODY_BYTES,
      attachments: "forbidden",
      send: "forbidden",
    },
  };
  const proposals = await input.executor.propose(structuredClone(context));
  const evidence: ProposalEvidence[] = [];
  for (const [index, proposal] of proposals.entries()) {
    const item = proposalEvidence(proposal);
    const decision = authorize(proposal, context, index + 1);
    if (decision.verdict === "block") {
      item.denialReason = decision.reason;
      evidence.push(item);
      continue;
    }
    item.guard = "allow";
    const effect = await input.capability.createReplyDraft(
      proposal as DraftProposal,
    );
    item.effect = "created";
    item.draftIdHash = hash(effect.draftId);
    evidence.push(item);
  }

  const after = input.observation.snapshot();
  const previousDraftIds = new Set(before.drafts.map((draft) => draft.id));
  const newDrafts = after.drafts.filter(
    (draft) => !previousDraftIds.has(draft.id),
  );
  const draft = newDrafts[0];
  const mutations = input.observation.mutations();
  const recipientMatch = !!draft && same(draft.to, context.policy.exactRecipients);
  const replyMatch =
    !!draft &&
    draft.threadId === context.source.threadId &&
    draft.subject === context.policy.exactSubject;
  const unrelatedUnchanged = unrelatedStateUnchanged(before, after, newDrafts);
  const mutationContained =
    mutations.length === 1 && mutations[0]?.operation === "draft.create";
  const accepted =
    proposals.length === 1 &&
    evidence.length === 1 &&
    evidence[0]?.guard === "allow" &&
    evidence[0]?.effect === "created" &&
    newDrafts.length === 1 &&
    draft?.sent === false &&
    recipientMatch &&
    replyMatch &&
    draft.attachments.length === 0 &&
    same(before.sent, after.sent) &&
    unrelatedUnchanged &&
    mutationContained;

  return {
    intent: {
      action: "create_reply_draft",
      sourceThreadHash: hash(input.selectedThreadId),
      draftLimit: 1,
      send: "forbidden",
    },
    contextHash: hash(context),
    executor: input.executor.identity,
    proposals: evidence,
    observation: {
      newDraftCount: newDrafts.length,
      unsent: draft?.sent === false,
      recipientPolicy: recipientMatch ? "match" : "mismatch",
      replyRelationship: replyMatch ? "match" : "mismatch",
      attachments: draft?.attachments.length ?? 0,
      sentStateUnchanged: same(before.sent, after.sent),
      unrelatedStateUnchanged: unrelatedUnchanged && mutationContained,
      mutations: mutations.map((mutation: Mutation) => ({
        operation: mutation.operation,
        resourceHash: hash(mutation.resource),
      })),
    },
    reaction: accepted ? "accept" : "reject",
    verdict: accepted ? "success" : "failure",
  };
}
