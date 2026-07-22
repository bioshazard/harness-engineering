export type State =
  | "GRILLING" | "SPECIFYING" | "SLICING"
  | "IMPLEMENTING" | "REVIEWING" | "FIXING" | "COMMITTING"
  | "ACCEPTED" | "DONE";

export type ProposalKind =
  | "shared_understanding" | "test_seams" | "spec" | "tickets"
  | "ticket_ready_for_review" | "review" | "ticket_complete";

export interface ArtifactRef {
  hash: string;
  bytes: number;
  mediaType: string;
}

export interface CompositionLock {
  source: string;
  revision: string;
  workflowRevision: string;
  phaseRevision: string;
  objectHash: string;
  objectBytes: number;
  files: Record<string, string>;
  model: string;
  provider: string;
  thinking: string;
  policyHash: string;
  capabilitiesHash: string;
  projectionRevision: string;
  guardRevision: string;
  receiptSchemaRevision: string;
}

export interface Ticket {
  id: string;
  title: string;
  whatToBuild: string;
  acceptanceCriteria: string[];
  blockedBy: string[];
  status: "pending" | "active" | "accepted";
  evidence: ArtifactRef[];
  commitId?: string;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  state: State;
  ticketId?: string;
  payload: unknown;
  evidenceDigest: string;
  compositionHash: string;
  status: "pending" | "accepted" | "rejected" | "invalidated";
  createdAt: string;
}

export interface Receipt {
  id: string;
  sequence: number;
  type: "proposal" | "decision" | "transition" | "evidence" | "session";
  payload: unknown;
  previousHash: string | null;
  hash: string;
  createdAt: string;
}

export interface SessionBinding {
  sessionId: string;
  state: State;
  ticketId?: string;
  active: boolean;
  createdAt: string;
}

export interface Run {
  id: string;
  revision: number;
  idea: string;
  state: State;
  composition: CompositionLock;
  decisions: unknown[];
  glossary: unknown[];
  adrs: unknown[];
  testSeams?: unknown[];
  spec?: ArtifactRef;
  tickets: Ticket[];
  shapingComplete: boolean;
  activeTicketId?: string;
  evidence: ArtifactRef[];
  reviewReports?: { standards: ArtifactRef; specification: ArtifactRef };
  proposals: Proposal[];
  receipts: Receipt[];
  sessions: SessionBinding[];
  createdAt: string;
  updatedAt: string;
}

export interface Projection {
  runId: string;
  revision: number;
  intent: string;
  state: State;
  decisions: unknown[];
  glossary: unknown[];
  adrs: unknown[];
  testSeams?: unknown[];
  spec?: ArtifactRef;
  activeTicket?: Ticket;
  readyTickets: Pick<Ticket, "id" | "title">[];
  evidence: ArtifactRef[];
  pendingProposals: string[];
  terminalContract: string;
}

export class CrustError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CrustError";
  }
}
