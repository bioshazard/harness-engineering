export type Identity = {
  provider: string;
  model: string;
  responseModel?: string;
};

export type ReviewPolicy = {
  id: string;
  criteria: readonly string[];
  trustedReviewers: readonly { provider: string; model: string }[];
};

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

export type SentMessage = {
  id: string;
  draftId: string;
  threadId: string;
  to: string[];
  subject: string;
  body: string;
};

export type MailboxSnapshot = {
  messages: Message[];
  drafts: Draft[];
  sent: SentMessage[];
};

export type Mutation = {
  operation: "draft.create" | "draft.send" | "message.archive";
  resource: string;
};

export type DraftMcp = {
  readThread(threadId: string): Promise<Message>;
  createReplyDraft(threadId: string, body: string): Promise<{
    draft: Draft;
    verifiedUnsent: boolean;
  }>;
  readDraft(draftId: string): Promise<Draft>;
};

export type SendMcp = {
  readDraft(draftId: string): Promise<Draft>;
  sendDraft(draftId: string): Promise<{ sentId: string }>;
  readSent(sentId: string): Promise<SentMessage>;
};

export type MailboxObserver = {
  snapshot(): MailboxSnapshot;
  mutations(): Mutation[];
};

export type DraftExecutor = {
  identity: Identity;
  draft(input: {
    thread: Message;
    revisionFeedback?: string;
  }): Promise<string>;
};

export type ReviewVerdict = "approve" | "revise" | "reject" | "escalate";

export type ReviewExecutor = {
  identity: Identity;
  review(input: {
    thread: Message;
    draft: Draft;
    policy: { id: string; criteria: readonly string[] };
  }): Promise<{ verdict: ReviewVerdict; feedback: string }>;
};
