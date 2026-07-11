import { createHash, randomUUID } from "node:crypto";

export const ACTIVE_PHASES = ["GRILLING", "SPECIFYING", "SLICING", "IMPLEMENTING", "REVIEWING"] as const;
export type ActivePhase = typeof ACTIVE_PHASES[number];
export type PocockPhase = ActivePhase | "DONE";
export type CompositionLock = { skill: string; version: string; source: string; model: string };
export type Question = { id: string; prompt: string; required: boolean; status: "open" | "accepted" };
export type Decision = { id: string; questionId: string; decision: string; rationale: string; alternativesRejected: string[]; status: "proposed" | "accepted" | "rejected"; proposedAt: string };
export type Ticket = { id: string; title: string; blockedBy: string[]; status: "pending" | "ready" | "implementing" | "implemented" | "complete" };
export type Approval = { proposalId: string; operatorId: string; approved: boolean; reason?: string; at: string };
export type SpecProposal = { id: string; reference: string; contentHash: string; status: "proposed" | "accepted" | "rejected"; proposedAt: string };
export type SliceProposal = { id: string; tickets: Array<Pick<Ticket, "id" | "title" | "blockedBy">>; status: "proposed" | "accepted" | "rejected"; proposedAt: string };
export type ImplementationProposal = { id: string; ticketId: string; commit: string; tests: string[]; typecheck: string; status: "proposed" | "accepted" | "rejected"; proposedAt: string };
export type ReviewProposal = { id: string; ticketId: string; standardsFindings: string[]; specFindings: string[]; status: "proposed" | "accepted" | "rejected"; proposedAt: string };

export type GrillingReceipt = { schema: "grilling-receipt/v1"; acceptedDecisionIds: string[]; completedAt: string };
export type SpecifyingReceipt = { schema: "specifying-receipt/v1"; spec: { reference: string; contentHash: string }; completedAt: string };
export type SlicingReceipt = { schema: "slicing-receipt/v1"; ticketIds: string[]; readyTicketIds: string[]; completedAt: string };
export type ImplementingReceipt = { schema: "implementing-receipt/v1"; ticketId: string; commit: string; tests: string[]; typecheck: string; completedAt: string };
export type ReviewingReceipt = { schema: "reviewing-receipt/v1"; ticketId: string; standardsFindings: string[]; specFindings: string[]; completedAt: string };
export type Receipt = GrillingReceipt | SpecifyingReceipt | SlicingReceipt | ImplementingReceipt | ReviewingReceipt;

export type PocockRun = {
  id: string;
  workflowRevision: "pocock/v1";
  intent: string;
  phase: PocockPhase;
  compositions: Record<ActivePhase, CompositionLock>;
  questions: Question[];
  decisions: Decision[];
  spec?: SpecProposal;
  slices?: SliceProposal;
  implementation?: ImplementationProposal;
  review?: ReviewProposal;
  tickets: Ticket[];
  activeTicketId?: string;
  approvals: Approval[];
  receipts: Receipt[];
  events: Array<{ type: string; at: string; proposalId?: string }>;
};

type CreateRun = Pick<PocockRun, "id" | "intent" | "compositions"> & { questions: Array<Omit<Question, "status">> };
type Proposal = Decision | SpecProposal | SliceProposal | ImplementationProposal | ReviewProposal;

export class PocockWorkflow {
  constructor(readonly state: PocockRun) {}

  static create(input: CreateRun): PocockRun {
    return {
      id: input.id,
      workflowRevision: "pocock/v1",
      intent: input.intent,
      phase: "GRILLING",
      compositions: input.compositions,
      questions: input.questions.map((question) => ({ ...question, status: "open" })),
      decisions: [], tickets: [], approvals: [], receipts: [], events: [],
    };
  }

  composition(): CompositionLock {
    if (this.state.phase === "DONE") throw new Error("workflow is DONE");
    return this.state.compositions[this.state.phase];
  }

  proposeDecision(input: Omit<Decision, "id" | "status" | "proposedAt">): Decision {
    this.assertPhase("GRILLING");
    const question = this.question(input.questionId);
    if (question.status !== "open") throw new Error(`question ${question.id} is already resolved`);
    if (!input.decision.trim() || !input.rationale.trim()) throw new Error("decision and rationale are required");
    const proposal: Decision = { ...input, id: id("decision"), status: "proposed", proposedAt: now() };
    this.state.decisions.push(proposal); this.event("DECISION_PROPOSED", proposal.id);
    return proposal;
  }

  proposeSpec(reference: string, independentlyRetrievedContent: string): SpecProposal {
    this.assertPhase("SPECIFYING");
    if (!reference.trim()) throw new Error("spec reference is required");
    const missing = REQUIRED_SPEC_HEADINGS.filter((heading) => !independentlyRetrievedContent.includes(`## ${heading}`));
    if (missing.length) throw new Error(`spec missing required headings: ${missing.join(", ")}`);
    const proposal: SpecProposal = { id: id("spec"), reference, contentHash: hash(independentlyRetrievedContent), status: "proposed", proposedAt: now() };
    this.state.spec = proposal; this.event("SPEC_PROPOSED", proposal.id);
    return proposal;
  }

  proposeSlices(tickets: Array<Pick<Ticket, "id" | "title" | "blockedBy">>): SliceProposal {
    this.assertPhase("SLICING");
    if (!tickets.length) throw new Error("at least one ticket is required");
    const ids = new Set<string>();
    for (const ticket of tickets) {
      if (!ticket.id.trim() || ids.has(ticket.id)) throw new Error("every ticket needs a unique stable ID");
      if (!ticket.title.trim()) throw new Error(`ticket ${ticket.id} needs a title`);
      ids.add(ticket.id);
    }
    const ready = tickets.filter((ticket) => ticket.blockedBy.length === 0);
    if (!ready.length) throw new Error("at least one ready ticket is required");
    const proposal: SliceProposal = { id: id("slices"), tickets, status: "proposed", proposedAt: now() };
    this.state.slices = proposal; this.event("SLICES_PROPOSED", proposal.id);
    return proposal;
  }

  proposeImplementation(input: Omit<ImplementationProposal, "id" | "status" | "proposedAt">): ImplementationProposal {
    this.assertPhase("IMPLEMENTING");
    if (input.ticketId !== this.state.activeTicketId) throw new Error("implementation must bind the active ticket");
    if (!input.commit.trim() || !input.tests.length || !input.typecheck.trim()) throw new Error("commit, test evidence, and typecheck evidence are required");
    const proposal: ImplementationProposal = { ...input, id: id("implementation"), status: "proposed", proposedAt: now() };
    this.state.implementation = proposal; this.event("IMPLEMENTATION_PROPOSED", proposal.id);
    return proposal;
  }

  proposeReview(input: Omit<ReviewProposal, "id" | "status" | "proposedAt">): ReviewProposal {
    this.assertPhase("REVIEWING");
    if (input.ticketId !== this.state.activeTicketId) throw new Error("review must bind the active ticket");
    const proposal: ReviewProposal = { ...input, id: id("review"), status: "proposed", proposedAt: now() };
    this.state.review = proposal; this.event("REVIEW_PROPOSED", proposal.id);
    return proposal;
  }

  approve(proposalId: string, operatorId: string, reason?: string): Proposal {
    const proposal = this.proposal(proposalId);
    if (proposal.status !== "proposed") throw new Error(`proposal ${proposalId} is already ${proposal.status}`);
    proposal.status = "accepted";
    if (this.isDecision(proposal)) this.question(proposal.questionId).status = "accepted";
    this.state.approvals.push({ proposalId, operatorId, approved: true, reason, at: now() });
    this.event("PROPOSAL_ACCEPTED", proposalId);
    return proposal;
  }

  reject(proposalId: string, operatorId: string, reason?: string): Proposal {
    const proposal = this.proposal(proposalId);
    if (proposal.status !== "proposed") throw new Error(`proposal ${proposalId} is already ${proposal.status}`);
    proposal.status = "rejected";
    this.state.approvals.push({ proposalId, operatorId, approved: false, reason, at: now() });
    this.event("PROPOSAL_REJECTED", proposalId);
    return proposal;
  }

  /** Commits the phase change only after a separate operator approval. */
  advance(operatorId: string): Receipt {
    const receipt = this.receiptForCurrentPhase();
    this.state.approvals.push({ proposalId: `advance:${this.state.phase}`, operatorId, approved: true, at: now() });
    this.state.receipts.push(receipt);
    this.transition();
    this.event("PHASE_ADVANCED");
    return receipt;
  }

  contextProjection(): string {
    const accepted = this.state.decisions.filter((decision) => decision.status === "accepted");
    const lines = [`Intent: ${this.state.intent}`, `Phase: ${this.state.phase}`, "Accepted decisions:"];
    lines.push(...(accepted.map((decision) => `- ${decision.questionId}: ${decision.decision}`) || ["- none"]));
    if (this.state.spec?.status === "accepted") lines.push(`Spec: ${this.state.spec.reference}`);
    if (this.state.activeTicketId) lines.push(`Active ticket: ${this.state.activeTicketId}`);
    return lines.join("\n");
  }

  private receiptForCurrentPhase(): Receipt {
    switch (this.state.phase) {
      case "GRILLING": {
        const unresolved = this.state.questions.filter((question) => question.required && question.status !== "accepted");
        if (unresolved.length) throw new Error(`required decisions remain: ${unresolved.map((question) => question.id).join(", ")}`);
        return { schema: "grilling-receipt/v1", acceptedDecisionIds: this.state.decisions.filter((decision) => decision.status === "accepted").map((decision) => decision.id), completedAt: now() };
      }
      case "SPECIFYING": {
        const spec = this.accepted(this.state.spec, "spec");
        return { schema: "specifying-receipt/v1", spec: { reference: spec.reference, contentHash: spec.contentHash }, completedAt: now() };
      }
      case "SLICING": {
        const slices = this.accepted(this.state.slices, "slices");
        const readyTicketIds = slices.tickets.filter((ticket) => ticket.blockedBy.length === 0).map((ticket) => ticket.id);
        return { schema: "slicing-receipt/v1", ticketIds: slices.tickets.map((ticket) => ticket.id), readyTicketIds, completedAt: now() };
      }
      case "IMPLEMENTING": {
        const implementation = this.accepted(this.state.implementation, "implementation");
        return { schema: "implementing-receipt/v1", ticketId: implementation.ticketId, commit: implementation.commit, tests: implementation.tests, typecheck: implementation.typecheck, completedAt: now() };
      }
      case "REVIEWING": {
        const review = this.accepted(this.state.review, "review");
        return { schema: "reviewing-receipt/v1", ticketId: review.ticketId, standardsFindings: review.standardsFindings, specFindings: review.specFindings, completedAt: now() };
      }
      case "DONE": throw new Error("workflow is DONE");
    }
  }

  private transition(): void {
    switch (this.state.phase) {
      case "GRILLING": this.state.phase = "SPECIFYING"; return;
      case "SPECIFYING": this.state.phase = "SLICING"; return;
      case "SLICING": {
        const accepted = this.accepted(this.state.slices, "slices");
        this.state.tickets = accepted.tickets.map((ticket) => ({ ...ticket, status: ticket.blockedBy.length ? "pending" : "ready" }));
        this.selectReadyTicket(); this.state.phase = "IMPLEMENTING"; return;
      }
      case "IMPLEMENTING": this.ticket(this.state.activeTicketId!).status = "implemented"; this.state.phase = "REVIEWING"; return;
      case "REVIEWING": {
        const review = this.accepted(this.state.review, "review");
        const ticket = this.ticket(review.ticketId);
        if (review.standardsFindings.length || review.specFindings.length) { ticket.status = "ready"; this.state.phase = "IMPLEMENTING"; return; }
        ticket.status = "complete"; this.unblockTickets();
        if (this.state.tickets.some((candidate) => candidate.status === "ready")) { this.selectReadyTicket(); this.state.phase = "IMPLEMENTING"; return; }
        this.state.activeTicketId = undefined; this.state.phase = "DONE"; return;
      }
      case "DONE": throw new Error("workflow is DONE");
    }
  }

  private unblockTickets(): void {
    for (const ticket of this.state.tickets) if (ticket.status === "pending" && ticket.blockedBy.every((id) => this.ticket(id).status === "complete")) ticket.status = "ready";
  }
  private selectReadyTicket(): void { const ticket = this.state.tickets.find((candidate) => candidate.status === "ready"); if (!ticket) throw new Error("no ready ticket"); ticket.status = "implementing"; this.state.activeTicketId = ticket.id; }
  private accepted<T extends { status: string }>(proposal: T | undefined, label: string): T { if (!proposal || proposal.status !== "accepted") throw new Error(`an accepted ${label} proposal is required`); return proposal; }
  private question(id: string): Question { const question = this.state.questions.find((candidate) => candidate.id === id); if (!question) throw new Error(`unknown question ${id}`); return question; }
  private ticket(id: string): Ticket { const ticket = this.state.tickets.find((candidate) => candidate.id === id); if (!ticket) throw new Error(`unknown ticket ${id}`); return ticket; }
  private proposal(id: string): Proposal { const proposal = [...this.state.decisions, this.state.spec, this.state.slices, this.state.implementation, this.state.review].find((candidate) => candidate?.id === id); if (!proposal) throw new Error(`unknown proposal ${id}`); return proposal; }
  private isDecision(proposal: Proposal): proposal is Decision { return "questionId" in proposal; }
  private assertPhase(phase: ActivePhase): void { if (this.state.phase !== phase) throw new Error(`action is only legal in ${phase}; run is ${this.state.phase}`); }
  private event(type: string, proposalId?: string): void { this.state.events.push({ type, at: now(), proposalId }); }
}

const REQUIRED_SPEC_HEADINGS = ["Problem Statement", "Solution", "User Stories", "Implementation Decisions", "Testing Decisions", "Out of Scope"];
function now(): string { return new Date().toISOString(); }
function id(prefix: string): string { return `${prefix}-${randomUUID()}`; }
function hash(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
