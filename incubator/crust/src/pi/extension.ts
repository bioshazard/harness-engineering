import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCrustKernel, type CrustKernel } from "../kernel/kernel.js";
import { CrustError, type Run } from "../kernel/types.js";
import { PocockClient, PROPOSAL_SCHEMAS, REVIEW_AXES_SCHEMA, STAGE_ARTIFACT_SCHEMA } from "../pocock/client.js";
import { runReviewAxes } from "./review.js";

const BINDING = "crust-run";
const revision = "d574778f94cf620fcc8ce741584093bc650a61d3";
function bindingFrom(ctx: ExtensionContext): string | undefined {
  const entry = [...ctx.sessionManager.getEntries()].reverse().find((candidate) => candidate.type === "custom" && candidate.customType === BINDING);
  if (!entry || entry.type !== "custom" || !entry.data || typeof entry.data !== "object") return undefined;
  const value = (entry.data as { runId?: unknown }).runId;
  return typeof value === "string" ? value : undefined;
}

export default function crustExtension(pi: ExtensionAPI): void {
  let kernel: CrustKernel | undefined;
  let runId: string | undefined;
  let enabled = false;
  let commandContext: ExtensionCommandContext | undefined;

  const getKernel = (ctx: ExtensionContext): CrustKernel => {
    kernel ??= createCrustKernel({
      root: join(ctx.cwd, ".crust"), client: new PocockClient(),
      skills: { dir: skillDirectory(ctx.cwd), source: "mattpocock/skills", revision, lock: skillLock(ctx.cwd) },
      runtime: { provider: ctx.model?.provider ?? "openai-codex", model: ctx.model?.id ?? "gpt-5.4", thinking: pi.getThinkingLevel() },
    });
    return kernel;
  };

  const activate = (run: Run): void => {
    try { pi.setActiveTools(kernel?.activeTools(run.id) ?? []); } catch { pi.setActiveTools([]); }
  };

  pi.on("session_start", async (_event, ctx) => {
    enabled = false;
    runId = bindingFrom(ctx);
    if (!runId) { pi.setActiveTools([]); return; }
    try {
      const activeKernel = getKernel(ctx);
      let run = activeKernel.verifyResume(runId);
      await activeKernel.verifyStoredComposition(runId);
      const sessionId = ctx.sessionManager.getSessionId();
      let crossedBoundary = false;
      if (!run.sessions.some((session) => session.active && session.sessionId === sessionId)) {
        run = activeKernel.operator(runId).restoreSession(run.revision, sessionId);
        crossedBoundary = true;
      }
      activate(run); enabled = true;
      if (crossedBoundary) drive(run);
    } catch (error) {
      pi.setActiveTools([]);
      ctx.ui.notify(`Crust restore blocked: ${message(error)}`, "error");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!enabled || !runId) return { systemPrompt: "Crust is not bound and verified. Do not proceed; ask the operator to use /crust start or /crust resume." };
    if ((event.systemPromptOptions.skills?.length ?? 0) > 0 || (event.systemPromptOptions.contextFiles?.length ?? 0) > 0 || event.systemPromptOptions.customPrompt || event.systemPromptOptions.appendSystemPrompt) {
      enabled = false; pi.setActiveTools([]);
      throw new CrustError("AMBIENT_COMPOSITION", "Ambient skills, context files, or prompts are forbidden; restart Pi with the documented isolation flags");
    }
    return { systemPrompt: await getKernel(ctx).lockedPrompt(runId, ctx.sessionManager.getSessionId()) };
  });

  for (const [name, parameters] of Object.entries(PROPOSAL_SCHEMAS) as Array<[keyof typeof PROPOSAL_SCHEMAS, TSchema]>) {
    pi.registerTool({
      name, label: name, description: "Submit the active Pocock gate proposal for operator decision.", parameters,
      async execute(_callId, params: Static<typeof parameters>, _signal, _update, ctx) {
        if (!enabled || !runId) throw new CrustError("RUN_NOT_BOUND", "No verified Crust run");
        const expected = getKernel(ctx).activeTool(runId);
        if (name !== expected) throw new CrustError("CAPABILITY_DENIED", `${name} is not active in this state`);
        const activeKernel = getKernel(ctx);
        let run = activeKernel.run(runId);
        run = await activeKernel.child(runId, ctx.sessionManager.getSessionId()).propose(run.revision, params);
        activate(run);
        const proposalId = run.proposals.at(-1)!.id;
        if (run.state === "SLICING" && !commandContext) {
          ctx.ui.notify("Proposal saved. Use /crust status to restore operator session authority, then /crust accept as recovery.", "warning");
          return { content: [{ type: "text", text: `Proposal ${proposalId} awaiting operator decision.` }], details: {} };
        }
        const decision = await chooseProposal(ctx, activeKernel, run.id, proposalId);
        if (!decision) return { content: [{ type: "text", text: `Proposal ${proposalId} awaiting operator decision.` }], details: {} };
        if (decision === "Reject") {
          const reason = await ctx.ui.input("Reject proposal", "Reason required");
          if (!reason?.trim()) return { content: [{ type: "text", text: `Proposal ${proposalId} awaiting operator decision.` }], details: {} };
          run = activeKernel.operator(runId).reject(run.revision, proposalId, reason.trim());
          ctx.abort();
          drive(run, `The previous proposal was rejected: ${reason.trim()}`);
          return { content: [{ type: "text", text: `Proposal ${proposalId} rejected.` }], details: {} };
        }
        run = activeKernel.operator(runId).accept(run.revision, proposalId);
        if (run.state === "SLICING" && run.shapingComplete) {
          const choices = activeKernel.readyTickets(run.id);
          const ticketId = choices.length === 1 ? choices[0]!.id : await ctx.ui.select("Start ready ticket", choices.map((ticket) => ticket.id));
          if (!ticketId) return { content: [{ type: "text", text: `Proposal ${proposalId} accepted; ticket start pending.` }], details: {} };
          run = activeKernel.operator(runId).startTicket(run.revision, ticketId);
          ctx.abort();
          await replaceSession(commandContext!, run.id);
          return { content: [{ type: "text", text: `Proposal ${proposalId} accepted; ticket ${ticketId} started.` }], details: {} };
        }
        ctx.abort();
        ctx.ui.notify(`Accepted; state ${run.state}.`, "info");
        drive(run);
        return { content: [{ type: "text", text: `Proposal ${proposalId} accepted; state ${run.state}.` }], details: {} };
      },
    });
  }

  pi.registerTool({
    name: "stage_artifact", label: "Stage Crust artifact", description: "Store bounded textual evidence or an output artifact and return its immutable reference.", parameters: STAGE_ARTIFACT_SCHEMA,
    async execute(_callId, params, _signal, _update, ctx) {
      if (!enabled || !runId) throw new CrustError("RUN_NOT_BOUND", "No verified Crust run");
      const ref = await getKernel(ctx).child(runId, ctx.sessionManager.getSessionId()).stageArtifact(params.content, params.mediaType);
      return { content: [{ type: "text", text: JSON.stringify(ref) }], details: ref };
    },
  });

  pi.registerTool({
    name: "run_review_axes", label: "Run Crust review axes", description: "Run isolated read-only standards and specification reviewers in parallel.", parameters: REVIEW_AXES_SCHEMA,
    async execute(_callId, _params, signal, _update, ctx) {
      if (!enabled || !runId) throw new CrustError("RUN_NOT_BOUND", "No verified Crust run");
      const activeKernel = getKernel(ctx);
      if (!activeKernel.activeTools(runId).includes("run_review_axes")) throw new CrustError("CAPABILITY_DENIED", "Review axes are not active in this state");
      const brief = await activeKernel.reviewBrief(runId);
      const reports = await runReviewAxes({ cwd: ctx.cwd, provider: ctx.model?.provider ?? "openai-codex", model: ctx.model?.id ?? "gpt-5.4", thinking: pi.getThinkingLevel(), ...brief, signal });
      const child = activeKernel.child(runId, ctx.sessionManager.getSessionId());
      const run = activeKernel.run(runId);
      const recorded = await child.recordReviewReports(run.revision, reports.standards, reports.specification);
      const { standards: standardsReport, specification: specificationReport } = recorded.reviewReports!;
      return { content: [{ type: "text", text: JSON.stringify({ standardsReport, specificationReport, ...reports }, null, 2) }], details: { standardsReport, specificationReport, ...reports } };
    },
  });

  pi.registerCommand("crust", {
    description: "start, resume, status, evidence, accept, reject, next",
    handler: async (args, ctx) => {
      commandContext = ctx;
      try { await command(args.trim(), ctx); } catch (error) { ctx.ui.notify(message(error), "error"); }
    },
  });

  async function command(input: string, ctx: ExtensionCommandContext): Promise<void> {
    const [verb = "status", ...rest] = input.split(/\s+/);
    const activeKernel = getKernel(ctx);
    if (verb === "start") {
      const idea = parseIdea(rest.join(" ")); if (!idea) throw new CrustError("IDEA_REQUIRED", "Usage: /crust start <idea>");
      const run = await activeKernel.createRun({ idea, sessionId: ctx.sessionManager.getSessionId() });
      runId = run.id; pi.appendEntry(BINDING, { runId }); enabled = true; activate(run);
      ctx.ui.notify(`Crust run ${run.id} started.`, "info");
      drive(run);
      return;
    }
    if (verb === "resume") {
      runId = rest[0] ?? bindingFrom(ctx); if (!runId) throw new CrustError("RUN_ID_REQUIRED", "Usage: /crust resume <run-id>");
      let run = activeKernel.verifyResume(runId); await activeKernel.verifyStoredComposition(runId);
      const sessionId = ctx.sessionManager.getSessionId();
      if (!run.sessions.some((session) => session.active && session.sessionId === sessionId)) run = activeKernel.operator(runId).resumeSession(run.revision, sessionId);
      enabled = true; pi.appendEntry(BINDING, { runId }); activate(run); ctx.ui.notify(`Resumed ${run.id}.`, "info");
      drive(run);
      return;
    }
    if (!runId) throw new CrustError("RUN_NOT_BOUND", "No Crust run; use /crust start or /crust resume");
    let run = activeKernel.run(runId);
    if (verb === "status") { ctx.ui.notify(JSON.stringify(activeKernel.projection(runId, ctx.sessionManager.getSessionId()), null, 2), "info"); return; }
    if (verb === "evidence") { ctx.ui.notify(JSON.stringify(run.evidence, null, 2), "info"); return; }
    if (verb === "accept") {
      const proposalId = rest[0]; if (!proposalId) throw new CrustError("PROPOSAL_REQUIRED", "Usage: /crust accept <proposal-id>");
      const presentation = await activeKernel.proposalPresentation(runId, proposalId);
      await ctx.ui.editor("Recovery proposal inspection", presentation.full);
      if (!await ctx.ui.confirm("Accept proposal", presentation.summary)) return;
      run = activeKernel.operator(runId).accept(run.revision, proposalId);
      if (run.state === "SLICING" && run.shapingComplete) {
        const choices = activeKernel.readyTickets(run.id);
        const ticketId = choices.length === 1 ? choices[0]!.id : await ctx.ui.select("Start ready ticket", choices.map((ticket) => ticket.id));
        if (!ticketId) return;
        run = activeKernel.operator(runId).startTicket(run.revision, ticketId);
        await replaceSession(ctx, run.id);
        return;
      }
      activate(run); ctx.ui.notify(`Accepted; state ${run.state}.`, "info");
      drive(run);
      return;
    }
    if (verb === "reject") {
      const proposalId = rest.shift(); if (!proposalId) throw new CrustError("PROPOSAL_REQUIRED", "Usage: /crust reject <proposal-id> [reason]");
      const presentation = await activeKernel.proposalPresentation(runId, proposalId);
      await ctx.ui.editor("Recovery proposal inspection", presentation.full);
      if (!await ctx.ui.confirm("Reject proposal", presentation.summary)) return;
      const reason = rest.join(" ") || "operator rejected";
      run = activeKernel.operator(runId).reject(run.revision, proposalId, reason); activate(run);
      drive(run, `The previous proposal was rejected: ${reason}`);
      return;
    }
    if (verb === "next") {
      if (run.tickets.every((ticket) => ticket.status === "accepted")) { run = activeKernel.operator(runId).finish(run.revision); activate(run); ctx.ui.notify("Crust run DONE.", "info"); return; }
      run = activeKernel.operator(runId).startTicket(run.revision, rest[0]); await replaceSession(ctx, run.id); return;
    }
    throw new CrustError("UNKNOWN_COMMAND", `Unknown /crust command: ${verb}`);
  }

  async function replaceSession(ctx: ExtensionCommandContext, id: string): Promise<void> {
    enabled = false; pi.setActiveTools([]);
    const result = await ctx.newSession({
      setup: async (manager) => { manager.appendCustomEntry(BINDING, { runId: id }); },
      withSession: async (fresh) => { await fresh.reload(); },
    });
    if (result.cancelled) throw new CrustError("SESSION_REPLACEMENT_CANCELLED", "Fresh ticket session was cancelled");
  }
  async function chooseProposal(ctx: ExtensionContext, activeKernel: CrustKernel, id: string, proposalId: string): Promise<string | undefined> {
    const presentation = await activeKernel.proposalPresentation(id, proposalId);
    while (true) {
      const decision = await ctx.ui.select(`Proposal: ${presentation.summary}`, ["Inspect full proposal", "Accept", "Reject"]);
      if (decision !== "Inspect full proposal") return decision;
      await ctx.ui.editor("Full immutable proposal", presentation.full);
    }
  }
  function drive(run: Run, suffix?: string): void {
    activate(run);
    const next = kernel?.nextAgentTurn(run.id);
    if (next) pi.sendUserMessage(suffix ? `${next}\n${suffix}` : next, { deliverAs: "followUp" });
  }
}

function skillDirectory(cwd: string): string {
  return join(cwd, ".pi", "skills");
}
function skillLock(cwd: string): Record<string, string> {
  const privateLock = join(cwd, ".crust", "skills-lock.json");
  const lock = JSON.parse(readFileSync(existsSync(privateLock) ? privateLock : join(cwd, "skills-lock.json"), "utf8")) as { skills: Record<string, { computedHash: string }> };
  return Object.fromEntries(Object.entries(lock.skills).map(([name, value]) => [name, value.computedHash]));
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function parseIdea(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1).trim();
  return trimmed;
}
