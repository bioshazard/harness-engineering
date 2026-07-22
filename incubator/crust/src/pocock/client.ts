import { CrustError, type ArtifactRef, type Proposal, type ProposalKind, type Projection, type Run, type State, type Ticket } from "../kernel/types.js";
import { Type } from "typebox";

const artifactSchema = Type.Object({ hash: Type.String(), bytes: Type.Integer(), mediaType: Type.String() });
export const PROPOSAL_SCHEMAS = {
  propose_shared_understanding: Type.Object({ decisions: Type.Array(Type.Unknown()), glossary: Type.Array(Type.Unknown()), adrs: Type.Array(Type.Unknown()) }),
  propose_test_seams: Type.Object({ seams: Type.Array(Type.Unknown()) }),
  propose_spec: Type.Object({ artifact: artifactSchema }),
  propose_tickets: Type.Object({ tickets: Type.Array(Type.Object({ id: Type.String(), title: Type.String(), whatToBuild: Type.String(), acceptanceCriteria: Type.Array(Type.String()), blockedBy: Type.Array(Type.String()) })) }),
  propose_ticket_ready_for_review: Type.Object({ implementation: artifactSchema, tests: artifactSchema, typecheck: artifactSchema }),
  propose_review: Type.Object({ standardsFindings: Type.Array(Type.Unknown()), specificationFindings: Type.Array(Type.Unknown()) }),
  propose_ticket_complete: Type.Object({ commit: Type.String() }),
} as const;
export const REVIEW_AXES_SCHEMA = Type.Object({});
export const STAGE_ARTIFACT_SCHEMA = Type.Object({ content: Type.String(), mediaType: Type.String() });
const WORKING_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const REVIEW_TOOLS = ["read", "grep", "find", "ls"];

const SKILLS: Record<State, string[]> = {
  GRILLING: ["grill-with-docs", "grilling", "domain-modeling"],
  SPECIFYING: ["to-spec", "codebase-design"],
  SLICING: ["to-tickets"],
  IMPLEMENTING: ["implement", "tdd", "codebase-design", "code-review"],
  REVIEWING: ["implement", "tdd", "codebase-design", "code-review"],
  FIXING: ["implement", "tdd", "codebase-design", "code-review"],
  COMMITTING: ["implement", "code-review"],
  ACCEPTED: [],
  DONE: [],
};

const TERMINALS: Record<State, string> = {
  GRILLING: "Propose shared understanding with decisions, glossary references, and ADR references.",
  SPECIFYING: "First propose public test seams; after acceptance propose an independently retrievable specification artifact.",
  SLICING: "Propose a stable acyclic ticket graph with explicit blockers.",
  IMPLEMENTING: "Propose implementation, test, and typecheck evidence for review.",
  REVIEWING: "Run the bounded parallel review axes, then propose their separate reports and findings.",
  FIXING: "Propose corrected implementation, test, and typecheck evidence.",
  COMMITTING: "Propose the final commit identity after clean review.",
  ACCEPTED: "Operator selects another ready ticket or finishes the run.",
  DONE: "Terminal.",
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isRef = (value: unknown): value is ArtifactRef => isRecord(value) && typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash) && typeof value.bytes === "number" && typeof value.mediaType === "string";
const requireArray = (record: Record<string, unknown>, key: string): unknown[] => {
  if (!Array.isArray(record[key])) throw new CrustError("INVALID_PROPOSAL", `${key} must be an array`);
  return record[key];
};

export class PocockClient {
  readonly workflowRevision = "pocock-v1.1-poc-2";
  readonly phaseRevision = "pocock-phases-1";
  readonly projectionRevision = "pocock-projection-2";
  readonly guardRevision = "pocock-guards-2";
  readonly receiptSchemaRevision = "crust-receipts-1";
  readonly policy = "Follow the locked Pocock skill composition. Use only the active proposal tool. The operator alone decides proposals and starts tickets.";

  skillClosure(): string[] { return [...new Set(Object.values(SKILLS).flat())].sort(); }
  capabilityIdentity() { return { ambient: false, builtinTools: WORKING_TOOLS, proposalSchemas: PROPOSAL_SCHEMAS, stageArtifactSchema: STAGE_ARTIFACT_SCHEMA, reviewAxesSchema: REVIEW_AXES_SCHEMA }; }
  builtinTools(state: State): string[] {
    if (state === "GRILLING" || state === "ACCEPTED" || state === "DONE") return [];
    return state === "REVIEWING" ? [...REVIEW_TOOLS] : [...WORKING_TOOLS];
  }
  supplementalTools(state: State): string[] { return state === "REVIEWING" ? ["run_review_axes"] : []; }
  nextAgentTurn(run: Run): string {
    const direction = run.state === "GRILLING"
      ? "Establish and record whether the current repository is the intended target, merely the orchestration host, or unrelated. Repository inspection capabilities remain unavailable until this gate is accepted."
      : "Continue from durable accepted state; do not reopen prior gates or infer context from ambient repository contents.";
    return `Crust now owns workflow orchestration for this run.\nIntent: ${run.idea}\nActive state: ${run.state}.\nBegin now; do not wait for another invocation. ${direction} Follow the locked composition and use only its terminal proposal when ready.`;
  }
  skillsFor(state: State): string[] { return SKILLS[state]; }
  terminalContract(state: State): string { return TERMINALS[state]; }

  proposalSummary(proposal: Proposal): string {
    const payload = proposal.payload as Record<string, unknown>;
    const label: Record<ProposalKind, string> = {
      shared_understanding: "Shared understanding", test_seams: "Test seams", spec: "Specification",
      tickets: "Ticket graph", ticket_ready_for_review: "Implementation evidence",
      review: "Two-axis review", ticket_complete: "Ticket completion",
    };
    switch (proposal.kind) {
      case "shared_understanding": return `${label[proposal.kind]}\n${items(payload.decisions)}`;
      case "test_seams": return `${label[proposal.kind]}\n${items(payload.seams)}`;
      case "tickets": return `${label[proposal.kind]}\n${(payload.tickets as Array<Record<string, unknown>>).map((ticket) => `• ${ticket.id}: ${ticket.title}\n  ${ticket.whatToBuild}\n  Acceptance: ${(ticket.acceptanceCriteria as unknown[]).length} criterion/criteria`).join("\n")}`;
      case "review": return `${label[proposal.kind]}\nStandards: ${(payload.standardsFindings as unknown[]).length} finding(s)\nSpecification: ${(payload.specificationFindings as unknown[]).length} finding(s)\n${items([...(payload.standardsFindings as unknown[]), ...(payload.specificationFindings as unknown[])])}`;
      case "ticket_complete": return `${label[proposal.kind]}\nCommit: ${String(payload.commit)}`;
      case "spec": return `${label[proposal.kind]}\nImmutable artifact attached.`;
      case "ticket_ready_for_review": return `${label[proposal.kind]}\nImplementation, tests, and typecheck evidence attached.`;
    }
  }

  proposalKind(run: Run): ProposalKind {
    switch (run.state) {
      case "GRILLING": return "shared_understanding";
      case "SPECIFYING": return run.testSeams ? "spec" : "test_seams";
      case "SLICING":
        if (run.shapingComplete) throw new CrustError("NO_CHILD_ACTION", "Shaping is complete; operator must start a ticket");
        return "tickets";
      case "IMPLEMENTING": case "FIXING": return "ticket_ready_for_review";
      case "REVIEWING": return "review";
      case "COMMITTING": return "ticket_complete";
      default: throw new CrustError("NO_CHILD_ACTION", `No proposal is legal in ${run.state}`);
    }
  }

  toolName(run: Run): string { return `propose_${this.proposalKind(run)}`; }

  validate(run: Run, payload: unknown): void {
    if (!isRecord(payload)) throw new CrustError("INVALID_PROPOSAL", "Proposal payload must be an object");
    switch (this.proposalKind(run)) {
      case "shared_understanding":
        if (requireArray(payload, "decisions").length === 0) throw new CrustError("INVALID_PROPOSAL", "decisions cannot be empty");
        requireArray(payload, "glossary"); requireArray(payload, "adrs"); return;
      case "test_seams":
        if (requireArray(payload, "seams").length === 0) throw new CrustError("INVALID_PROPOSAL", "seams cannot be empty"); return;
      case "spec":
        if (!isRef(payload.artifact)) throw new CrustError("INVALID_PROPOSAL", "artifact must be an ArtifactRef"); return;
      case "tickets": this.validateTickets(requireArray(payload, "tickets")); return;
      case "ticket_ready_for_review":
        for (const key of ["implementation", "tests", "typecheck"]) if (!isRef(payload[key])) throw new CrustError("INVALID_PROPOSAL", `${key} must be an ArtifactRef`);
        return;
      case "review":
        if (!run.reviewReports) throw new CrustError("INVALID_PROPOSAL", "Review requires reports from run_review_axes");
        requireArray(payload, "standardsFindings"); requireArray(payload, "specificationFindings"); return;
      case "ticket_complete":
        if (typeof payload.commit !== "string" || !/^[a-f0-9]{40,64}$/.test(payload.commit)) throw new CrustError("INVALID_PROPOSAL", "commit must be a Git commit identity"); return;
      default: return;
    }
  }

  accept(run: Run, payload: unknown): { from: State; to: State } {
    this.validate(run, payload);
    const record = payload as Record<string, unknown>;
    const from = run.state;
    switch (run.state) {
      case "GRILLING":
        run.decisions.push(...(record.decisions as unknown[]));
        run.glossary.push(...(record.glossary as unknown[]));
        run.adrs.push(...(record.adrs as unknown[]));
        run.state = "SPECIFYING"; break;
      case "SPECIFYING":
        if (!run.testSeams) { run.testSeams = record.seams as unknown[]; break; }
        run.spec = record.artifact as ArtifactRef; run.evidence.push(run.spec); run.state = "SLICING"; break;
      case "SLICING":
        run.tickets = (record.tickets as Array<{ id: string; title: string; whatToBuild: string; acceptanceCriteria: string[]; blockedBy: string[] }>).map((ticket) => ({ ...ticket, status: "pending", evidence: [] }));
        run.shapingComplete = true;
        break;
      case "IMPLEMENTING": case "FIXING":
        this.addTicketEvidence(run, [record.implementation, record.tests, record.typecheck] as ArtifactRef[]);
        delete run.reviewReports;
        run.state = "REVIEWING";
        break;
      case "REVIEWING":
        this.addTicketEvidence(run, [run.reviewReports!.standards, run.reviewReports!.specification]);
        run.state = (record.standardsFindings as unknown[]).length + (record.specificationFindings as unknown[]).length > 0 ? "FIXING" : "COMMITTING";
        break;
      case "COMMITTING":
        this.activeTicket(run).status = "accepted";
        this.activeTicket(run).commitId = record.commit as string;
        run.state = "ACCEPTED";
        break;
      default: throw new CrustError("ILLEGAL_TRANSITION", `Cannot accept in ${run.state}`);
    }
    return { from, to: run.state };
  }

  projection(run: Run): Projection {
    const activeTicket = run.activeTicketId ? run.tickets.find((ticket) => ticket.id === run.activeTicketId) : undefined;
    return {
      runId: run.id, revision: run.revision, intent: run.idea, state: run.state,
      decisions: structuredClone(run.decisions),
      glossary: structuredClone(run.glossary), adrs: structuredClone(run.adrs),
      ...(run.testSeams ? { testSeams: structuredClone(run.testSeams) } : {}),
      ...(run.spec ? { spec: run.spec } : {}),
      ...(activeTicket ? { activeTicket: structuredClone(activeTicket) } : {}),
      readyTickets: this.readyTickets(run).map(({ id, title }) => ({ id, title })),
      evidence: structuredClone(activeTicket?.evidence ?? run.evidence),
      pendingProposals: run.proposals.filter((proposal) => proposal.status === "pending").map((proposal) => proposal.id),
      terminalContract: this.terminalContract(run.state),
    };
  }

  readyTickets(run: Run): Ticket[] {
    const accepted = new Set(run.tickets.filter((ticket) => ticket.status === "accepted").map((ticket) => ticket.id));
    return run.tickets.filter((ticket) => ticket.status === "pending" && ticket.blockedBy.every((id) => accepted.has(id)));
  }

  artifactRefs(run: Run, payload: unknown): ArtifactRef[] {
    if (!isRecord(payload)) return [];
    switch (this.proposalKind(run)) {
      case "spec": return isRef(payload.artifact) ? [payload.artifact] : [];
      case "ticket_ready_for_review": return [payload.implementation, payload.tests, payload.typecheck].filter(isRef);
      case "review": return run.reviewReports ? [run.reviewReports.standards, run.reviewReports.specification] : [];
      default: return [];
    }
  }

  private validateTickets(values: unknown[]): void {
    if (values.length === 0) throw new CrustError("INVALID_PROPOSAL", "tickets cannot be empty");
    const tickets = values.map((value) => {
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.whatToBuild !== "string" || !value.whatToBuild.trim() || !Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0 || !value.acceptanceCriteria.every((criterion) => typeof criterion === "string" && criterion.trim()) || !Array.isArray(value.blockedBy) || !value.blockedBy.every((id) => typeof id === "string")) throw new CrustError("INVALID_PROPOSAL", "Each ticket needs id, title, whatToBuild, acceptanceCriteria, and blockedBy");
      return value as { id: string; title: string; whatToBuild: string; acceptanceCriteria: string[]; blockedBy: string[] };
    });
    const ids = new Set(tickets.map((ticket) => ticket.id));
    if (ids.size !== tickets.length) throw new CrustError("INVALID_PROPOSAL", "Ticket IDs must be unique");
    if (tickets.some((ticket) => ticket.blockedBy.some((id) => !ids.has(id)))) throw new CrustError("INVALID_PROPOSAL", "Ticket blockers must exist");
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new CrustError("INVALID_PROPOSAL", "Ticket graph must be acyclic");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const blocker of tickets.find((ticket) => ticket.id === id)!.blockedBy) visit(blocker);
      visiting.delete(id); visited.add(id);
    };
    for (const ticket of tickets) visit(ticket.id);
  }

  private activeTicket(run: Run): Ticket {
    const ticket = run.tickets.find((candidate) => candidate.id === run.activeTicketId);
    if (!ticket) throw new CrustError("NO_ACTIVE_TICKET", "No active ticket");
    return ticket;
  }

  private addTicketEvidence(run: Run, refs: ArtifactRef[]): void {
    const ticket = this.activeTicket(run);
    ticket.evidence.push(...refs);
    run.evidence.push(...refs);
  }
}

function items(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.slice(0, 6).map((item) => `• ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n");
}
