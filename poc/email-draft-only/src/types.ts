export type Message = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  labels: string[];
};

export type Draft = {
  id: string;
  threadId: string;
  to: string[];
  subject: string;
  body: string;
  attachments: string[];
  sent: false;
};

export type MailboxSnapshot = {
  messages: Message[];
  drafts: Draft[];
  sent: string[];
};

export type Mutation =
  | { operation: "draft.create"; resource: string }
  | { operation: "message.archive"; resource: string }
  | { operation: "message.delete"; resource: string }
  | { operation: "message.label"; resource: string }
  | { operation: "draft.send"; resource: string };

export type DraftProposal = {
  operation: "create_reply_draft";
  sourceThreadId: string;
  recipients: string[];
  subject: string;
  body: string;
};

export type UnknownProposal = {
  operation: string;
  [key: string]: unknown;
};

export type Proposal = DraftProposal | UnknownProposal;

export type DraftContext = {
  intent: "draft_reply";
  source: {
    threadId: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
  };
  policy: {
    exactRecipients: string[];
    exactSubject: string;
    maxBodyBytes: number;
    attachments: "forbidden";
    send: "forbidden";
  };
};

export type Executor = {
  propose(context: DraftContext): Promise<Proposal[]>;
  identity: { provider: string; model: string };
};

export type DraftEffect = {
  reported: "created";
  draftId: string;
};

export type DraftCapability = {
  createReplyDraft(proposal: DraftProposal): Promise<DraftEffect>;
};

export type ObservationPort = {
  snapshot(): MailboxSnapshot;
  mutations(): Mutation[];
};
