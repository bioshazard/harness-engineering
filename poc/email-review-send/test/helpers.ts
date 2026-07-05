import {
  draftMcp,
  MockEmailProvider,
  sendMcp,
} from "../src/mcp.js";
import type {
  DraftExecutor,
  MailboxSnapshot,
  ReviewExecutor,
  ReviewVerdict,
} from "../src/types.js";

export const THREAD = "thread-selected";
export const SOURCE_BODY = "Can you confirm the launch date?";
export const APPROVED_BODY = "The launch date is Tuesday.";
export const REVIEWER = { provider: "test", model: "trusted-reviewer" };

export function state(): MailboxSnapshot {
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
    drafts: [],
    sent: [],
  };
}

export function fixture() {
  const provider = new MockEmailProvider(state());
  return {
    provider,
    draftMcp: draftMcp(provider),
    sendMcp: sendMcp(provider),
  };
}

export function drafter(bodies: string[] = [APPROVED_BODY]): DraftExecutor {
  let index = 0;
  return {
    identity: { provider: "test", model: "drafter" },
    async draft(input) {
      if (index > 0 && !input.revisionFeedback) {
        throw new Error("revision feedback missing");
      }
      return bodies[index++] ?? bodies.at(-1) ?? APPROVED_BODY;
    },
  };
}

export function reviewer(verdicts: ReviewVerdict[]): ReviewExecutor {
  let index = 0;
  return {
    identity: REVIEWER,
    async review() {
      const verdict = verdicts[index++] ?? "reject";
      return {
        verdict,
        feedback:
          verdict === "revise" ? "State the date directly." : "criteria met",
      };
    },
  };
}
