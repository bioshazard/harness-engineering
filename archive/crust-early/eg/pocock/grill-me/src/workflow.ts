import { randomUUID } from "node:crypto";

export type QuestionStatus = "open" | "accepted";
export type DecisionStatus = "proposed" | "accepted" | "rejected";
export type TerminalVerdict = "complete" | "blocked" | "cancelled" | "escalated";

export type CompositionLock = {
  skill: "grill-me";
  version: string;
  source: string;
  model: string;
  contextId: string;
};

export type GrillingQuestion = {
  id: string;
  prompt: string;
  required: boolean;
  status: QuestionStatus;
};

export type DecisionProposal = {
  questionId: string;
  decision: string;
  rationale: string;
  alternativesRejected: string[];
  glossaryChanges?: string[];
  adrDraft?: string;
};

export type Decision = DecisionProposal & {
  id: string;
  status: DecisionStatus;
  proposedAt: string;
};

export type OperatorApproval = {
  candidateId: string;
  operatorId: string;
  approved: boolean;
  reason?: string;
  at: string;
};

export type GrillingEvent = {
  type: "DECISION_PROPOSED" | "DECISION_ACCEPTED" | "DECISION_REJECTED" | "GRILLING_COMPLETED";
  at: string;
  decisionId?: string;
};

export type GrillingRun = {
  id: string;
  workflowRevision: string;
  state: "GRILLING" | "COMPLETE";
  intent: string;
  composition: CompositionLock;
  questions: GrillingQuestion[];
  decisions: Decision[];
  approvals: OperatorApproval[];
  artifacts: string[];
  events: GrillingEvent[];
  receipt?: GrillingReceipt;
};

export type GrillingReceipt = {
  schema: "grilling-receipt/v1";
  runId: string;
  workflowRevision: string;
  composition: CompositionLock;
  acceptedDecisionIds: string[];
  questionStatuses: Array<{ id: string; status: QuestionStatus }>;
  approvals: OperatorApproval[];
  artifacts: string[];
  terminalVerdict: "complete";
  proposedEvent: "GRILLING_COMPLETE";
  completedAt: string;
};

function now(): string {
  return new Date().toISOString();
}

export class GrillingWorkflow {
  constructor(readonly state: GrillingRun) {}

  proposeDecision(proposal: DecisionProposal): Decision {
    this.assertGrilling();
    const question = this.question(proposal.questionId);
    if (question.status !== "open") throw new Error(`question ${question.id} is already resolved`);
    if (!proposal.decision.trim() || !proposal.rationale.trim()) {
      throw new Error("decision and rationale are required");
    }

    const candidate: Decision = {
      ...proposal,
      id: `decision-${randomUUID()}`,
      status: "proposed",
      proposedAt: now(),
    };
    this.state.decisions.push(candidate);
    this.state.events.push({ type: "DECISION_PROPOSED", at: now(), decisionId: candidate.id });
    return candidate;
  }

  confirmDecision(candidateId: string, operatorId: string, approved: boolean, reason?: string): Decision {
    this.assertGrilling();
    const candidate = this.state.decisions.find((decision) => decision.id === candidateId);
    if (!candidate) throw new Error(`unknown decision ${candidateId}`);
    if (candidate.status !== "proposed") throw new Error(`decision ${candidateId} is already ${candidate.status}`);
    const question = this.question(candidate.questionId);
    if (approved && question.status !== "open") {
      throw new Error(`question ${question.id} is already resolved`);
    }

    const approval: OperatorApproval = { candidateId, operatorId, approved, reason, at: now() };
    this.state.approvals.push(approval);
    candidate.status = approved ? "accepted" : "rejected";

    if (approved) question.status = "accepted";
    this.state.events.push({
      type: approved ? "DECISION_ACCEPTED" : "DECISION_REJECTED",
      at: now(),
      decisionId: candidateId,
    });
    return candidate;
  }

  complete(): GrillingReceipt {
    this.assertGrilling();
    const unresolved = this.state.questions.filter((question) => question.required && question.status !== "accepted");
    if (unresolved.length > 0) {
      throw new Error(`required questions remain: ${unresolved.map((question) => question.id).join(", ")}`);
    }

    const receipt: GrillingReceipt = {
      schema: "grilling-receipt/v1",
      runId: this.state.id,
      workflowRevision: this.state.workflowRevision,
      composition: this.state.composition,
      acceptedDecisionIds: this.state.decisions.filter((decision) => decision.status === "accepted").map((decision) => decision.id),
      questionStatuses: this.state.questions.map(({ id, status }) => ({ id, status })),
      approvals: [...this.state.approvals],
      artifacts: [...this.state.artifacts],
      terminalVerdict: "complete",
      proposedEvent: "GRILLING_COMPLETE",
      completedAt: now(),
    };
    this.state.receipt = receipt;
    this.state.state = "COMPLETE";
    this.state.events.push({ type: "GRILLING_COMPLETED", at: now() });
    return receipt;
  }

  contextProjection(): string {
    const openQuestions = this.state.questions.filter((question) => question.status === "open");
    const accepted = this.state.decisions.filter((decision) => decision.status === "accepted");
    return [
      `Intent: ${this.state.intent}`,
      `Open questions:\n${openQuestions.map((question) => `- ${question.id}: ${question.prompt}`).join("\n") || "- none"}`,
      `Accepted decisions:\n${accepted.map((decision) => `- ${decision.questionId}: ${decision.decision}`).join("\n") || "- none"}`,
      `Referenced artifacts:\n${this.state.artifacts.map((artifact) => `- ${artifact}`).join("\n") || "- none"}`,
    ].join("\n\n");
  }

  private assertGrilling(): void {
    if (this.state.state !== "GRILLING") throw new Error(`run is ${this.state.state}`);
  }

  private question(id: string): GrillingQuestion {
    const question = this.state.questions.find((candidate) => candidate.id === id);
    if (!question) throw new Error(`unknown question ${id}`);
    return question;
  }
}
