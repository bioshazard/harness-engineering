import { draftHash, hash, receiptId } from "./evidence.js";
import type {
  DraftExecutor,
  DraftMcp,
  Identity,
  ReviewExecutor,
  ReviewPolicy,
  ReviewVerdict,
  SendMcp,
} from "./types.js";

export type DraftReceipt = {
  kind: "draft";
  id: string;
  verdict: "pass" | "fail";
  threadHash: string;
  draftId: string;
  draftHash: string;
  bodyHash: string;
  verifiedUnsent: boolean;
  executor: Identity;
};

export type ReviewReceipt = {
  kind: "review";
  id: string;
  verdict: ReviewVerdict;
  draftId: string;
  draftHash: string;
  feedbackHash: string;
  policyId: string;
  policyHash: string;
  reviewer: Identity;
};

export type SendReceipt = {
  kind: "send";
  id: string;
  verdict: "pass" | "fail";
  draftId: string;
  approvedDraftHash: string;
  observedDraftHash: string;
  authority:
    | { verdict: "allow"; reviewer: Identity }
    | { verdict: "block"; reason: string };
  effect: "sent" | "not_run";
  sentIdHash?: string;
  observedSentHash?: string;
};

export async function runDraftChild(input: {
  threadId: string;
  mcp: DraftMcp;
  executor: DraftExecutor;
  revisionFeedback?: string;
}): Promise<DraftReceipt> {
  const thread = await input.mcp.readThread(input.threadId);
  const body = await input.executor.draft({
    thread,
    revisionFeedback: input.revisionFeedback,
  });
  if (!body.trim() || Buffer.byteLength(body) > 8_192) {
    throw new Error("draft body outside budget");
  }
  const result = await input.mcp.createReplyDraft(input.threadId, body);
  const observed = await input.mcp.readDraft(result.draft.id);
  const passed =
    result.verifiedUnsent &&
    observed.sent === false &&
    observed.threadId === input.threadId &&
    observed.to.length === 1 &&
    observed.to[0] === thread.from &&
    observed.attachments.length === 0;
  const partial = {
    kind: "draft" as const,
    verdict: passed ? ("pass" as const) : ("fail" as const),
    threadHash: hash(input.threadId),
    draftId: observed.id,
    draftHash: draftHash(observed),
    bodyHash: hash(body),
    verifiedUnsent: passed,
    executor: { ...input.executor.identity },
  };
  return { ...partial, id: receiptId(partial) };
}

export async function runReviewChild(input: {
  threadId: string;
  draftId: string;
  mcp: DraftMcp;
  reviewer: ReviewExecutor;
  policy: ReviewPolicy;
}): Promise<{ receipt: ReviewReceipt; feedback: string }> {
  const [thread, draft] = await Promise.all([
    input.mcp.readThread(input.threadId),
    input.mcp.readDraft(input.draftId),
  ]);
  const review = await input.reviewer.review({
    thread,
    draft,
    policy: { id: input.policy.id, criteria: input.policy.criteria },
  });
  const partial = {
    kind: "review" as const,
    verdict: review.verdict,
    draftId: draft.id,
    draftHash: draftHash(draft),
    feedbackHash: hash(review.feedback),
    policyId: input.policy.id,
    policyHash: hash(input.policy),
    reviewer: { ...input.reviewer.identity },
  };
  return {
    receipt: { ...partial, id: receiptId(partial) },
    feedback: review.feedback,
  };
}

export async function runSendChild(input: {
  approval: ReviewReceipt;
  mcp: SendMcp;
  policy: ReviewPolicy;
}): Promise<SendReceipt> {
  const draft = await input.mcp.readDraft(input.approval.draftId);
  const observedDraftHash = draftHash(draft);
  const trusted = input.policy.trustedReviewers.some(
    (identity) =>
      identity.provider === input.approval.reviewer.provider &&
      identity.model === input.approval.reviewer.model,
  );
  const reason =
    input.approval.verdict !== "approve"
      ? "review did not approve"
      : input.approval.policyId !== input.policy.id ||
          input.approval.policyHash !== hash(input.policy)
        ? "review Policy identity mismatch"
      : !trusted
        ? "reviewer not trusted by Policy"
        : observedDraftHash !== input.approval.draftHash
          ? "draft changed after review"
          : null;
  if (reason) {
    const partial = {
      kind: "send" as const,
      verdict: "fail" as const,
      draftId: draft.id,
      approvedDraftHash: input.approval.draftHash,
      observedDraftHash,
      authority: { verdict: "block" as const, reason },
      effect: "not_run" as const,
    };
    return { ...partial, id: receiptId(partial) };
  }
  const effect = await input.mcp.sendDraft(draft.id);
  const sent = await input.mcp.readSent(effect.sentId);
  const sentContentHash = draftHash({
    ...sent,
    attachments: [],
  });
  const passed =
    sent.draftId === draft.id && sentContentHash === observedDraftHash;
  const partial = {
    kind: "send" as const,
    verdict: passed ? ("pass" as const) : ("fail" as const),
    draftId: draft.id,
    approvedDraftHash: input.approval.draftHash,
    observedDraftHash,
    authority: {
      verdict: "allow" as const,
      reviewer: input.approval.reviewer,
    },
    effect: "sent" as const,
    sentIdHash: hash(sent.id),
    observedSentHash: sentContentHash,
  };
  return { ...partial, id: receiptId(partial) };
}
