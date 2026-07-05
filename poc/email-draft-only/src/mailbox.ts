import type {
  Draft,
  DraftCapability,
  DraftEffect,
  DraftProposal,
  MailboxSnapshot,
  Message,
  Mutation,
  ObservationPort,
} from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryMailbox implements ObservationPort {
  readonly #messages: Message[];
  readonly #drafts: Draft[];
  readonly #sent: string[];
  readonly #mutations: Mutation[] = [];
  #nextDraft = 1;

  constructor(state: MailboxSnapshot) {
    this.#messages = clone(state.messages);
    this.#drafts = clone(state.drafts);
    this.#sent = clone(state.sent);
  }

  snapshot(): MailboxSnapshot {
    return clone({
      messages: this.#messages,
      drafts: this.#drafts,
      sent: this.#sent,
    });
  }

  mutations() {
    return clone(this.#mutations);
  }

  messageInThread(threadId: string) {
    const message = this.#messages.find(
      (candidate) => candidate.threadId === threadId,
    );
    return message ? clone(message) : null;
  }

  createDraft(input: Omit<Draft, "id" | "sent">): Draft {
    const draft: Draft = {
      ...clone(input),
      id: `draft-${this.#nextDraft++}`,
      sent: false,
    };
    this.#drafts.push(draft);
    this.#mutations.push({
      operation: "draft.create",
      resource: draft.id,
    });
    return clone(draft);
  }

  archiveMessage(messageId: string) {
    const message = this.#messages.find((candidate) => candidate.id === messageId);
    if (!message) throw new Error("message not found");
    message.labels = message.labels.filter((label) => label !== "inbox");
    this.#mutations.push({
      operation: "message.archive",
      resource: messageId,
    });
  }

  deleteMessage(messageId: string) {
    const index = this.#messages.findIndex(
      (candidate) => candidate.id === messageId,
    );
    if (index < 0) throw new Error("message not found");
    this.#messages.splice(index, 1);
    this.#mutations.push({
      operation: "message.delete",
      resource: messageId,
    });
  }

  addLabel(messageId: string, label: string) {
    const message = this.#messages.find((candidate) => candidate.id === messageId);
    if (!message) throw new Error("message not found");
    message.labels.push(label);
    this.#mutations.push({
      operation: "message.label",
      resource: messageId,
    });
  }

  sendDraft(draftId: string) {
    const draft = this.#drafts.find((candidate) => candidate.id === draftId);
    if (!draft) throw new Error("draft not found");
    this.#sent.push(draftId);
    this.#mutations.push({ operation: "draft.send", resource: draftId });
  }
}

export function draftCapability(mailbox: InMemoryMailbox): DraftCapability {
  return {
    async createReplyDraft(proposal: DraftProposal): Promise<DraftEffect> {
      const draft = mailbox.createDraft({
        threadId: proposal.sourceThreadId,
        to: proposal.recipients,
        subject: proposal.subject,
        body: proposal.body,
        attachments: [],
      });
      return { reported: "created", draftId: draft.id };
    },
  };
}
