import type {
  Draft,
  DraftMcp,
  MailboxObserver,
  MailboxSnapshot,
  Message,
  Mutation,
  SendMcp,
  SentMessage,
} from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MockEmailProvider implements MailboxObserver {
  #state: MailboxSnapshot;
  #mutations: Mutation[] = [];
  #nextDraft = 1;
  #nextSent = 1;

  constructor(state: MailboxSnapshot) {
    this.#state = clone(state);
  }

  snapshot() {
    return clone(this.#state);
  }

  mutations() {
    return clone(this.#mutations);
  }

  readThread(threadId: string): Message {
    const message = this.#state.messages.find(
      (candidate) => candidate.threadId === threadId,
    );
    if (!message) throw new Error("thread not found");
    return clone(message);
  }

  readDraft(draftId: string): Draft {
    const draft = this.#state.drafts.find(
      (candidate) => candidate.id === draftId,
    );
    if (!draft) throw new Error("draft not found");
    return clone(draft);
  }

  createDraft(input: Omit<Draft, "id" | "sent">): Draft {
    const draft: Draft = {
      ...clone(input),
      id: `draft-${this.#nextDraft++}`,
      sent: false,
    };
    this.#state.drafts.push(draft);
    this.#mutations.push({ operation: "draft.create", resource: draft.id });
    return clone(draft);
  }

  sendDraft(draftId: string): SentMessage {
    const draft = this.readDraft(draftId);
    const sent: SentMessage = {
      id: `sent-${this.#nextSent++}`,
      draftId,
      threadId: draft.threadId,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    };
    this.#state.sent.push(sent);
    this.#mutations.push({ operation: "draft.send", resource: draftId });
    return clone(sent);
  }

  archiveMessage(messageId: string) {
    const message = this.#state.messages.find(
      (candidate) => candidate.id === messageId,
    );
    if (!message) throw new Error("message not found");
    message.labels = message.labels.filter((label) => label !== "inbox");
    this.#mutations.push({
      operation: "message.archive",
      resource: messageId,
    });
  }

  replaceDraftBody(draftId: string, body: string) {
    const draft = this.#state.drafts.find(
      (candidate) => candidate.id === draftId,
    );
    if (!draft) throw new Error("draft not found");
    draft.body = body;
  }
}

export function draftMcp(provider: MockEmailProvider): DraftMcp {
  return {
    async readThread(threadId) {
      return provider.readThread(threadId);
    },
    async createReplyDraft(threadId, body) {
      const thread = provider.readThread(threadId);
      const draft = provider.createDraft({
        threadId,
        to: [thread.from],
        subject: /^re:/i.test(thread.subject)
          ? thread.subject
          : `Re: ${thread.subject}`,
        body,
        attachments: [],
      });
      const observed = provider.readDraft(draft.id);
      return {
        draft: observed,
        verifiedUnsent:
          observed.sent === false &&
          observed.threadId === threadId &&
          observed.attachments.length === 0,
      };
    },
    async readDraft(draftId) {
      return provider.readDraft(draftId);
    },
  };
}

export function sendMcp(provider: MockEmailProvider): SendMcp {
  return {
    async readDraft(draftId) {
      return provider.readDraft(draftId);
    },
    async sendDraft(draftId) {
      return { sentId: provider.sendDraft(draftId).id };
    },
    async readSent(sentId) {
      const sent = provider
        .snapshot()
        .sent.find((candidate) => candidate.id === sentId);
      if (!sent) throw new Error("sent message not found");
      return sent;
    },
  };
}
