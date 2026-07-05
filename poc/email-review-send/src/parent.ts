import {
  runDraftChild,
  runReviewChild,
  runSendChild,
  type DraftReceipt,
  type ReviewReceipt,
  type SendReceipt,
} from "./children.js";
import { hash } from "./evidence.js";
import type {
  DraftExecutor,
  DraftMcp,
  Identity,
  MailboxObserver,
  ReviewExecutor,
  SendMcp,
} from "./types.js";

export type ParentReceipt = {
  intent: {
    action: "reviewed_reply_send";
    threadHash: string;
    revisionLimit: 1;
  };
  transitions: {
    phase: "draft" | "review" | "send";
    childReceiptId: string;
    observation: string;
    reaction: "review" | "revise" | "send" | "accept" | "reject" | "escalate";
  }[];
  childReceipts: (DraftReceipt | ReviewReceipt | SendReceipt)[];
  terminalObservation: {
    sentDelta: number;
    mutationOperations: string[];
    unrelatedMessagesUnchanged: boolean;
    existingDraftsUnchanged: boolean;
  };
  terminalVerdict: "accept" | "reject" | "escalate";
  reason: string;
};

export async function runEmailMeso(input: {
  threadId: string;
  draftMcp: DraftMcp;
  sendMcp: SendMcp;
  observation: MailboxObserver;
  drafter: DraftExecutor;
  reviewer: ReviewExecutor;
  trustedReviewers: Identity[];
}): Promise<ParentReceipt> {
  const before = input.observation.snapshot();
  const transitions: ParentReceipt["transitions"] = [];
  const childReceipts: ParentReceipt["childReceipts"] = [];
  let revisions = 0;
  let feedback: string | undefined;
  let requested: ParentReceipt["terminalVerdict"] = "reject";
  let reason = "";

  while (true) {
    const draft = await runDraftChild({
      threadId: input.threadId,
      mcp: input.draftMcp,
      executor: input.drafter,
      revisionFeedback: feedback,
    });
    childReceipts.push(draft);
    if (draft.verdict === "fail") {
      transitions.push({
        phase: "draft",
        childReceiptId: draft.id,
        observation: "draft child failed verification",
        reaction: "reject",
      });
      reason = "draft child failed";
      break;
    }
    transitions.push({
      phase: "draft",
      childReceiptId: draft.id,
      observation: "verified unsent draft",
      reaction: "review",
    });

    const reviewResult = await runReviewChild({
      threadId: input.threadId,
      draftId: draft.draftId,
      mcp: input.draftMcp,
      reviewer: input.reviewer,
    });
    const review = reviewResult.receipt;
    childReceipts.push(review);

    if (review.verdict === "revise") {
      if (revisions >= 1) {
        transitions.push({
          phase: "review",
          childReceiptId: review.id,
          observation: "review requested revision after budget exhausted",
          reaction: "reject",
        });
        reason = "revision budget exhausted";
        break;
      }
      revisions += 1;
      feedback = reviewResult.feedback;
      transitions.push({
        phase: "review",
        childReceiptId: review.id,
        observation: "review requested bounded revision",
        reaction: "revise",
      });
      continue;
    }
    if (review.verdict === "reject" || review.verdict === "escalate") {
      requested = review.verdict === "escalate" ? "escalate" : "reject";
      transitions.push({
        phase: "review",
        childReceiptId: review.id,
        observation: `review verdict: ${review.verdict}`,
        reaction: review.verdict,
      });
      reason = `review ${review.verdict}`;
      break;
    }

    transitions.push({
      phase: "review",
      childReceiptId: review.id,
      observation: "review approved exact draft hash",
      reaction: "send",
    });
    const send = await runSendChild({
      approval: review,
      mcp: input.sendMcp,
      trustedReviewers: input.trustedReviewers,
    });
    childReceipts.push(send);
    if (send.verdict === "pass") {
      requested = "accept";
      transitions.push({
        phase: "send",
        childReceiptId: send.id,
        observation: "sent State matches approved draft",
        reaction: "accept",
      });
      reason = "approved draft sent and independently observed";
    } else {
      transitions.push({
        phase: "send",
        childReceiptId: send.id,
        observation:
          send.authority.verdict === "block"
            ? send.authority.reason
            : "sent State mismatch",
        reaction: "reject",
      });
      reason = "send blocked or failed verification";
    }
    break;
  }

  const after = input.observation.snapshot();
  const initialDraftIds = new Set(before.drafts.map((draft) => draft.id));
  const existingDraftsUnchanged =
    hash(before.drafts) ===
    hash(after.drafts.filter((draft) => initialDraftIds.has(draft.id)));
  const unrelatedMessagesUnchanged = hash(before.messages) === hash(after.messages);
  const sentDelta = after.sent.length - before.sent.length;
  const mutations = input.observation.mutations();
  const contained = mutations.every(
    (mutation) =>
      mutation.operation === "draft.create" ||
      mutation.operation === "draft.send",
  );
  const accepted =
    requested === "accept" &&
    sentDelta === 1 &&
    unrelatedMessagesUnchanged &&
    existingDraftsUnchanged &&
    contained;
  const terminalVerdict =
    accepted ? "accept" : requested === "escalate" ? "escalate" : "reject";
  if (requested === "accept" && !accepted) {
    reason = "terminal mailbox Observation violated acceptance Policy";
  }
  return {
    intent: {
      action: "reviewed_reply_send",
      threadHash: hash(input.threadId),
      revisionLimit: 1,
    },
    transitions,
    childReceipts,
    terminalObservation: {
      sentDelta,
      mutationOperations: mutations.map((mutation) => mutation.operation),
      unrelatedMessagesUnchanged,
      existingDraftsUnchanged,
    },
    terminalVerdict,
    reason,
  };
}
