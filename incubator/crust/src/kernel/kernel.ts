import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PocockClient } from "../pocock/client.js";
import { canonical, digest, id, sha256 } from "./hash.js";
import { directoryHash, ObjectStore } from "./objects.js";
import { SqliteRunStore } from "./store.js";
import { CrustError, type ArtifactRef, type CompositionLock, type Proposal, type Receipt, type Run } from "./types.js";

export interface KernelOptions {
  root: string;
  client: PocockClient;
  skills: { dir: string; source: string; revision: string; lock: Record<string, string> };
  runtime: { provider: string; model: string; thinking: string };
}

const now = (): string => new Date().toISOString();

export function createCrustKernel(options: KernelOptions) {
  const objects = new ObjectStore(join(options.root, "objects"));
  const store = new SqliteRunStore(join(options.root, "crust.sqlite"));
  const client = options.client;

  const appendReceipt = (run: Run, type: Receipt["type"], payload: unknown): void => {
    const previous = run.receipts.at(-1)?.hash ?? null;
    const receipt: Omit<Receipt, "hash"> = { id: id(), sequence: run.receipts.length + 1, type, payload, previousHash: previous, createdAt: now() };
    run.receipts.push({ ...receipt, hash: digest(receipt) });
  };

  const assertSession = (run: Run, sessionId: string): void => {
    if (!run.sessions.some((session) => session.active && session.sessionId === sessionId)) throw new CrustError("STALE_SESSION", `Session ${sessionId} is not bound to run ${run.id}`);
  };

  const evidenceDigest = (run: Run): string => digest(run.evidence);
  const compositionDigest = (run: Run): string => digest(run.composition);
  const expectedCompositionIdentity = (runtime = options.runtime) => ({
    source: options.skills.source, revision: options.skills.revision,
    workflowRevision: client.workflowRevision, phaseRevision: client.phaseRevision,
    model: runtime.model, provider: runtime.provider, thinking: runtime.thinking,
    policyHash: sha256(client.policy), capabilitiesHash: digest(client.capabilityIdentity()),
    projectionRevision: client.projectionRevision, guardRevision: client.guardRevision,
    receiptSchemaRevision: client.receiptSchemaRevision,
  });
  const bindSession = (run: Run, sessionId: string, resumed: boolean): void => {
    for (const session of run.sessions) session.active = false;
    run.sessions.push({ sessionId, state: run.state, ...(run.activeTicketId ? { ticketId: run.activeTicketId } : {}), active: true, createdAt: now() });
    appendReceipt(run, "session", { sessionId, state: run.state, ...(run.activeTicketId ? { ticketId: run.activeTicketId } : {}), ...(resumed ? { resumed: true } : {}) });
  };
  const readComposition = async (run: Run): Promise<Record<string, string>> => {
    const snapshot = await objects.get({ hash: run.composition.objectHash, bytes: run.composition.objectBytes, mediaType: "application/vnd.crust.composition+json" });
    const bodies = JSON.parse(snapshot.toString("utf8")) as Record<string, string>;
    for (const [path, expected] of Object.entries(run.composition.files)) {
      const body = bodies[path];
      if (!body || sha256(Buffer.from(body, "base64")) !== expected) throw new CrustError("COMPOSITION_TAMPERED", `Locked file ${path} failed verification`);
    }
    if (Object.keys(bodies).length !== Object.keys(run.composition.files).length) throw new CrustError("COMPOSITION_TAMPERED", "Locked composition file set changed");
    return bodies;
  };

  const operator = (runId: string) => ({
    accept(expectedRevision: number, proposalId: string): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        const proposal = run.proposals.find((candidate) => candidate.id === proposalId);
        if (!proposal || proposal.status !== "pending") throw new CrustError("PROPOSAL_NOT_PENDING", "Proposal is not pending");
        if (proposal.evidenceDigest !== evidenceDigest(run)) throw new CrustError("STALE_EVIDENCE", "Proposal evidence changed");
        if (proposal.compositionHash !== compositionDigest(run)) throw new CrustError("STALE_COMPOSITION", "Proposal composition changed");
        const transition = client.accept(run, proposal.payload);
        proposal.status = "accepted";
        appendReceipt(run, "decision", { proposalId, decision: "accepted" });
        if (transition.from !== transition.to) appendReceipt(run, "transition", transition);
      });
    },
    reject(expectedRevision: number, proposalId: string, reason: string): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        const proposal = run.proposals.find((candidate) => candidate.id === proposalId);
        if (!proposal || proposal.status !== "pending") throw new CrustError("PROPOSAL_NOT_PENDING", "Proposal is not pending");
        proposal.status = "rejected";
        appendReceipt(run, "decision", { proposalId, decision: "rejected", reason });
      });
    },
    async recordEvidence(expectedRevision: number, data: string | Uint8Array): Promise<Run> {
      const ref = await objects.put(data);
      return store.mutate(runId, expectedRevision, (run) => { run.evidence.push(ref); appendReceipt(run, "evidence", ref); });
    },
    startTicket(expectedRevision: number, ticketId?: string): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        if (!(run.state === "SLICING" && run.shapingComplete) && run.state !== "ACCEPTED") throw new CrustError("ILLEGAL_TRANSITION", `Cannot start a ticket from ${run.state}`);
        const ready = client.readyTickets(run);
        const selected = ticketId ? ready.find((ticket) => ticket.id === ticketId) : ready[0];
        if (!selected) throw new CrustError("TICKET_NOT_READY", `Ticket ${ticketId ?? ""} is not ready`);
        selected.status = "active";
        run.activeTicketId = selected.id;
        run.state = "IMPLEMENTING";
        for (const session of run.sessions) session.active = false;
        appendReceipt(run, "transition", { from: "ticket-frontier", to: "IMPLEMENTING", ticketId: selected.id });
      });
    },
    restoreSession(expectedRevision: number, sessionId: string): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        if (run.sessions.some((session) => session.active)) throw new CrustError("SESSION_ALREADY_BOUND", "Run already has an active session");
        if (run.state !== "IMPLEMENTING") throw new CrustError("ILLEGAL_SESSION", "Fresh sessions are only created for active tickets");
        bindSession(run, sessionId, false);
      });
    },
    resumeSession(expectedRevision: number, sessionId: string): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        bindSession(run, sessionId, true);
      });
    },
    finish(expectedRevision: number): Run {
      return store.mutate(runId, expectedRevision, (run) => {
        if (run.state !== "ACCEPTED" || run.tickets.some((ticket) => ticket.status !== "accepted")) throw new CrustError("RUN_NOT_COMPLETE", "All tickets must be accepted");
        run.state = "DONE";
        delete run.activeTicketId;
        appendReceipt(run, "transition", { from: "ACCEPTED", to: "DONE" });
      });
    },
  });

  return {
    async createRun(input: { idea: string; sessionId: string }): Promise<Run> {
      await mkdir(options.root, { recursive: true });
      const closure = client.skillClosure();
      if (digest(Object.keys(options.skills.lock).sort()) !== digest(closure)) throw new CrustError("SKILL_LOCK_MISMATCH", "Skill lock does not match the hard-coded dependency closure");
      for (const skill of closure) if (await directoryHash(join(options.skills.dir, skill)) !== options.skills.lock[skill]) throw new CrustError("SKILL_LOCK_MISMATCH", `Installed skill ${skill} does not match committed lock metadata`);
      const snapshot = await objects.snapshot(options.skills.dir, closure);
      const composition: CompositionLock = {
        ...expectedCompositionIdentity(),
        objectHash: snapshot.object.hash, objectBytes: snapshot.object.bytes, files: snapshot.files,
      };
      const createdAt = now();
      const run: Run = {
        id: id(), revision: 0, idea: input.idea, state: "GRILLING", composition,
        decisions: [], glossary: [], adrs: [], tickets: [], shapingComplete: false, evidence: [], proposals: [], receipts: [],
        sessions: [{ sessionId: input.sessionId, state: "GRILLING", active: true, createdAt }], createdAt, updatedAt: createdAt,
      };
      appendReceipt(run, "session", { sessionId: input.sessionId, state: "GRILLING" });
      store.create(run);
      return run;
    },
    run(runId: string): Run { return store.get(runId); },
    child(runId: string, sessionId: string) {
      const initial = store.get(runId); assertSession(initial, sessionId); client.proposalKind(initial);
      return {
        toolName: client.toolName(initial),
        async stageArtifact(data: string | Uint8Array, mediaType?: string): Promise<ArtifactRef> { return objects.put(data, mediaType); },
        async recordReviewReports(expectedRevision: number, standards: string, specification: string): Promise<Run> {
          const before = store.get(runId); assertSession(before, sessionId);
          if (before.state !== "REVIEWING" || before.proposals.some((proposal) => proposal.status === "pending")) throw new CrustError("REVIEW_NOT_ACTIVE", "Review reports can only be recorded at the open review frontier");
          const [standardsRef, specificationRef] = await Promise.all([objects.put(standards, "text/markdown"), objects.put(specification, "text/markdown")]);
          return store.mutate(runId, expectedRevision, (run) => {
            assertSession(run, sessionId);
            if (run.state !== "REVIEWING" || run.proposals.some((proposal) => proposal.status === "pending")) throw new CrustError("REVIEW_NOT_ACTIVE", "Review frontier changed");
            run.reviewReports = { standards: standardsRef, specification: specificationRef };
            appendReceipt(run, "evidence", { reviewReports: run.reviewReports });
          });
        },
        async propose(expectedRevision: number, payload: unknown): Promise<Run> {
          const before = store.get(runId); assertSession(before, sessionId); client.validate(before, payload);
          for (const ref of client.artifactRefs(before, payload)) await objects.get(ref);
          return store.mutate(runId, expectedRevision, (run) => {
            assertSession(run, sessionId);
            client.validate(run, payload);
            const proposal: Proposal = {
              id: id(), kind: client.proposalKind(run), state: run.state,
              ...(run.activeTicketId ? { ticketId: run.activeTicketId } : {}), payload: structuredClone(payload),
              evidenceDigest: evidenceDigest(run), compositionHash: compositionDigest(run), status: "pending", createdAt: now(),
            };
            run.proposals.push(proposal);
            appendReceipt(run, "proposal", { proposalId: proposal.id, kind: proposal.kind });
          });
        },
      };
    },
    operator,
    projection(runId: string, sessionId: string) { const run = store.get(runId); assertSession(run, sessionId); return client.projection(run); },
    verifyResume(runId: string, runtimeOverride: Partial<KernelOptions["runtime"]> = {}): Run {
      const run = store.get(runId);
      const actual = { ...options.runtime, ...runtimeOverride };
      const expected = expectedCompositionIdentity(actual);
      for (const [key, value] of Object.entries(expected)) {
        if (key === "source" || key === "revision") continue;
        if (run.composition[key as keyof typeof expected] !== value) throw new CrustError("COMPOSITION_DRIFT", `Composition field ${key} does not match locked run`);
      }
      return run;
    },
    async verifyStoredComposition(runId: string): Promise<Run> {
      const run = store.get(runId);
      await readComposition(run);
      return run;
    },
    readArtifact(ref: ArtifactRef): Promise<Buffer> { return objects.get(ref); },
    async reviewBrief(runId: string): Promise<{ specification: string; ticket: string }> {
      const run = store.get(runId);
      const ticket = run.tickets.find((candidate) => candidate.id === run.activeTicketId);
      if (run.state !== "REVIEWING" || !run.spec || !ticket) throw new CrustError("REVIEW_NOT_ACTIVE", "No active review brief");
      return { specification: (await objects.get(run.spec)).toString("utf8"), ticket: canonical({ id: ticket.id, title: ticket.title, whatToBuild: ticket.whatToBuild, acceptanceCriteria: ticket.acceptanceCriteria, blockedBy: ticket.blockedBy }) };
    },
    async proposalPresentation(runId: string, proposalId: string): Promise<{ summary: string; full: string }> {
      const run = store.get(runId);
      const proposal = run.proposals.find((candidate) => candidate.id === proposalId);
      if (!proposal) throw new CrustError("PROPOSAL_REQUIRED", `Unknown proposal ${proposalId}`);
      const artifacts = await Promise.all(client.artifactRefs(run, proposal.payload).map(async (ref) => ({ ref, body: (await objects.get(ref)).toString("utf8") })));
      const artifactText = artifacts.map(({ ref, body }) => `## Artifact ${ref.hash} (${ref.mediaType})\n${body}`).join("\n\n");
      const excerpt = artifacts[0]?.body.trim().slice(0, 600);
      return {
        summary: `${client.proposalSummary(proposal)}${excerpt ? `\n\nArtifact preview:\n${excerpt}` : ""}`,
        full: `# ${proposal.kind}\n\n${canonical(proposal.payload)}${artifactText ? `\n\n${artifactText}` : ""}`,
      };
    },
    async lockedPrompt(runId: string, sessionId: string): Promise<string> {
      const run = store.get(runId); assertSession(run, sessionId);
      const bodies = await readComposition(run);
      const skillText = client.skillsFor(run.state).map((skill) => {
        const prefix = `${skill}/`;
        const files = Object.keys(bodies).filter((path) => path === `${skill}/SKILL.md` || path.startsWith(prefix)).sort();
        if (!files.includes(`${skill}/SKILL.md`)) throw new CrustError("COMPOSITION_MISSING", `Locked skill ${skill} is missing`);
        return files.map((path) => `## Locked file: ${path}\n${Buffer.from(bodies[path]!, "base64").toString("utf8")}`).join("\n\n");
      }).join("\n\n");
      const activeTicket = run.tickets.find((ticket) => ticket.id === run.activeTicketId);
      const boundedWork = activeTicket && run.spec
        ? `\n\n## Accepted specification\n${(await objects.get(run.spec)).toString("utf8")}\n\n## Active ticket contract\n${canonical({ id: activeTicket.id, title: activeTicket.title, whatToBuild: activeTicket.whatToBuild, acceptanceCriteria: activeTicket.acceptanceCriteria, blockedBy: activeTicket.blockedBy })}\n\nImplement only this active ticket. Do not implement later tickets.`
        : "";
      return `${client.policy}\n\n${skillText}${boundedWork}\n\n## Crust projection\n${canonical(client.projection(run))}`;
    },
    activeTool(runId: string): string { return client.toolName(store.get(runId)); },
    activeTools(runId: string): string[] {
      const run = store.get(runId);
      if (run.proposals.some((proposal) => proposal.status === "pending")) return [];
      try { return [...client.builtinTools(run.state), ...client.supplementalTools(run.state), "stage_artifact", client.toolName(run)]; }
      catch { return []; }
    },
    nextAgentTurn(runId: string): string | null {
      const run = store.get(runId);
      if (run.proposals.some((proposal) => proposal.status === "pending")) return null;
      try { client.proposalKind(run); return client.nextAgentTurn(run); } catch { return null; }
    },
    readyTickets(runId: string) { return client.readyTickets(store.get(runId)).map(({ id, title }) => ({ id, title })); },
    close(): void { store.close(); },
  };
}

export type CrustKernel = ReturnType<typeof createCrustKernel>;
