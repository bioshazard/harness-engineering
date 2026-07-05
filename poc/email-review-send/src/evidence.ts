import { createHash } from "node:crypto";

export function hash(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function draftHash(draft: {
  threadId: string;
  to: string[];
  subject: string;
  body: string;
  attachments: string[];
}) {
  return hash({
    threadId: draft.threadId,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    attachments: draft.attachments,
  });
}

export function receiptId(receipt: unknown) {
  return hash(receipt).slice(0, 20);
}
