import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { digest } from "./hash.js";
import { CrustError, type Proposal, type Receipt, type Run, type SessionBinding, type Ticket } from "./types.js";

type JsonRow = { body: string };

export class SqliteRunStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (run_id TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,id), FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS tickets (run_id TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,id), FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS sessions (run_id TEXT NOT NULL, ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,ordinal), FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS receipts (run_id TEXT NOT NULL, sequence INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,sequence), FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS transitions (run_id TEXT NOT NULL, receipt_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,receipt_id), FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE);
    `);
  }

  create(run: Run): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO runs(id, revision, body) VALUES (?, ?, ?)").run(run.id, run.revision, this.rootBody(run));
      this.syncChildren(run);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  get(id: string): Run {
    const row = this.db.prepare("SELECT revision, body FROM runs WHERE id = ?").get(id) as { revision: number; body: string } | undefined;
    if (!row) throw new CrustError("RUN_NOT_FOUND", `Unknown run ${id}`);
    const root = this.parse(row.body, "run") as Omit<Run, "proposals" | "tickets" | "sessions" | "receipts">;
    const run = {
      ...root,
      proposals: this.rows("SELECT body FROM proposals WHERE run_id = ? ORDER BY rowid", id) as Proposal[],
      tickets: this.rows("SELECT body FROM tickets WHERE run_id = ? ORDER BY rowid", id) as Ticket[],
      sessions: this.rows("SELECT body FROM sessions WHERE run_id = ? ORDER BY ordinal", id) as SessionBinding[],
      receipts: this.rows("SELECT body FROM receipts WHERE run_id = ? ORDER BY sequence", id) as Receipt[],
    } as Run;
    this.validate(run, id, row.revision);
    const storedTransitions = this.rows("SELECT body FROM transitions WHERE run_id = ? ORDER BY rowid", id);
    const expectedTransitions = run.receipts.filter((receipt) => receipt.type === "transition");
    if (digest(storedTransitions) !== digest(expectedTransitions)) throw new CrustError("TRANSITION_TAMPERED", `Run ${id} transition data failed validation`);
    return run;
  }

  mutate(id: string, expectedRevision: number, operation: (run: Run) => void): Run {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const run = this.get(id);
      if (run.revision !== expectedRevision) throw new CrustError("STALE_REVISION", `Expected revision ${expectedRevision}, found ${run.revision}`);
      operation(run);
      run.revision += 1; run.updatedAt = new Date().toISOString();
      const result = this.db.prepare("UPDATE runs SET revision = ?, body = ? WHERE id = ? AND revision = ?").run(run.revision, this.rootBody(run), id, expectedRevision);
      if (result.changes !== 1) throw new CrustError("STALE_REVISION", "Concurrent mutation won");
      this.syncChildren(run);
      this.db.exec("COMMIT");
      return run;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  close(): void { this.db.close(); }

  private rootBody(run: Run): string {
    const { proposals: _proposals, tickets: _tickets, sessions: _sessions, receipts: _receipts, ...root } = run;
    return JSON.stringify(root);
  }

  private syncChildren(run: Run): void {
    for (const table of ["proposals", "tickets", "sessions", "receipts", "transitions"]) this.db.prepare(`DELETE FROM ${table} WHERE run_id = ?`).run(run.id);
    const proposal = this.db.prepare("INSERT INTO proposals(run_id,id,body) VALUES (?,?,?)");
    for (const value of run.proposals) proposal.run(run.id, value.id, JSON.stringify(value));
    const ticket = this.db.prepare("INSERT INTO tickets(run_id,id,body) VALUES (?,?,?)");
    for (const value of run.tickets) ticket.run(run.id, value.id, JSON.stringify(value));
    const session = this.db.prepare("INSERT INTO sessions(run_id,ordinal,body) VALUES (?,?,?)");
    run.sessions.forEach((value, index) => session.run(run.id, index + 1, JSON.stringify(value)));
    const receipt = this.db.prepare("INSERT INTO receipts(run_id,sequence,body) VALUES (?,?,?)");
    const transition = this.db.prepare("INSERT INTO transitions(run_id,receipt_id,body) VALUES (?,?,?)");
    for (const value of run.receipts) {
      receipt.run(run.id, value.sequence, JSON.stringify(value));
      if (value.type === "transition") transition.run(run.id, value.id, JSON.stringify(value));
    }
  }

  private rows(sql: string, id: string): unknown[] { return (this.db.prepare(sql).all(id) as JsonRow[]).map((row) => this.parse(row.body, "row")); }
  private parse(body: string, label: string): unknown { try { return JSON.parse(body); } catch { throw new CrustError("INVALID_JSON", `Invalid ${label} JSON`); } }

  private validate(run: Run, id: string, revision: number): void {
    const states = new Set(["GRILLING", "SPECIFYING", "SLICING", "IMPLEMENTING", "REVIEWING", "FIXING", "COMMITTING", "ACCEPTED", "DONE"]);
    const hashes = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    const timestamp = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    const artifact = (value: unknown): boolean => !!value && typeof value === "object" && hashes((value as { hash?: unknown }).hash) && Number.isInteger((value as { bytes?: unknown }).bytes) && (value as { bytes: number }).bytes >= 0 && typeof (value as { mediaType?: unknown }).mediaType === "string";
    const composition = run.composition as unknown as Record<string, unknown>;
    const compositionStrings = ["source", "revision", "workflowRevision", "phaseRevision", "model", "provider", "thinking", "projectionRevision", "guardRevision", "receiptSchemaRevision"];
    if (run.id !== id || run.revision !== revision || !states.has(run.state) || typeof run.idea !== "string" || !timestamp(run.createdAt) || !timestamp(run.updatedAt)) throw new CrustError("RUN_TAMPERED", `Run ${id} failed schema validation`);
    if (!composition || compositionStrings.some((key) => typeof composition[key] !== "string") || !hashes(composition.objectHash) || !hashes(composition.policyHash) || !hashes(composition.capabilitiesHash) || !Number.isInteger(composition.objectBytes) || typeof composition.files !== "object" || !composition.files || Object.values(composition.files as Record<string, unknown>).some((hash) => !hashes(hash))) throw new CrustError("COMPOSITION_TAMPERED", `Run ${id} composition failed schema validation`);
    if (!Array.isArray(run.decisions) || !Array.isArray(run.glossary) || !Array.isArray(run.adrs) || !Array.isArray(run.evidence)) throw new CrustError("RUN_TAMPERED", `Run ${id} collections failed schema validation`);
    if (run.evidence.some((value) => !artifact(value)) || (run.spec && !artifact(run.spec))) throw new CrustError("ARTIFACT_TAMPERED", `Run ${id} artifact reference failed schema validation`);
    if (run.reviewReports && (!artifact(run.reviewReports.standards) || !artifact(run.reviewReports.specification))) throw new CrustError("ARTIFACT_TAMPERED", `Run ${id} review report reference failed schema validation`);
    const ticketStatuses = new Set(["pending", "active", "accepted"]);
    if (run.tickets.some((value) => typeof value.id !== "string" || typeof value.title !== "string" || typeof value.whatToBuild !== "string" || !Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.some((criterion) => typeof criterion !== "string") || !ticketStatuses.has(value.status) || !Array.isArray(value.blockedBy) || value.blockedBy.some((blocker) => typeof blocker !== "string") || !Array.isArray(value.evidence) || value.evidence.some((ref) => !artifact(ref)) || (value.commitId !== undefined && !/^[a-f0-9]{40,64}$/.test(value.commitId)))) throw new CrustError("TICKET_TAMPERED", `Run ${id} ticket failed schema validation`);
    const proposalKinds = new Set(["shared_understanding", "test_seams", "spec", "tickets", "ticket_ready_for_review", "review", "ticket_complete"]);
    const proposalStatuses = new Set(["pending", "accepted", "rejected", "invalidated"]);
    if (run.proposals.some((value) => typeof value.id !== "string" || !proposalKinds.has(value.kind) || !states.has(value.state) || !proposalStatuses.has(value.status) || !value.payload || typeof value.payload !== "object" || !hashes(value.evidenceDigest) || !hashes(value.compositionHash) || !timestamp(value.createdAt))) throw new CrustError("PROPOSAL_TAMPERED", `Run ${id} proposal failed schema validation`);
    if (run.sessions.some((value) => typeof value.sessionId !== "string" || !states.has(value.state) || typeof value.active !== "boolean" || !timestamp(value.createdAt))) throw new CrustError("SESSION_TAMPERED", `Run ${id} session failed schema validation`);
    let previous: string | null = null;
    for (let index = 0; index < run.receipts.length; index++) {
      const value = run.receipts[index]!; const { hash, ...unsigned } = value;
      if (typeof value.id !== "string" || !new Set(["proposal", "decision", "transition", "evidence", "session"]).has(value.type) || !timestamp(value.createdAt) || value.sequence !== index + 1 || value.previousHash !== previous || digest(unsigned) !== hash) throw new CrustError("RECEIPT_TAMPERED", `Run ${id} receipt chain failed validation`);
      previous = hash;
    }
  }
}
