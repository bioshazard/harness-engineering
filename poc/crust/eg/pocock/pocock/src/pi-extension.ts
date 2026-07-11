import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { FileRunStore } from "../../../../lib/store.js";
import { PocockWorkflow, type PocockRun } from "./workflow.js";

export function crustPocockExtension(workflow: PocockWorkflow, store: FileRunStore<PocockRun>): ExtensionFactory {
  return (pi) => {
    pi.registerTool(defineTool({
      name: "propose_decision", label: "Propose decision",
      description: "In GRILLING, record a candidate answer. It never advances the workflow; the operator must approve it.",
      parameters: Type.Object({ questionId: Type.String(), decision: Type.String(), rationale: Type.String(), alternativesRejected: Type.Array(Type.String()) }),
      execute: async (_id, proposal) => {
        const candidate = workflow.proposeDecision(proposal);
        await store.save(workflow.state);
        return notice(`Candidate ${candidate.id} recorded. Ask the operator to run /crust approve ${candidate.id}.`, candidate.id);
      },
    }));
    pi.registerTool(defineTool({
      name: "propose_phase_outcome", label: "Propose phase outcome",
      description: "In any non-grilling phase, propose the typed outcome as JSON. SPECIFYING: {reference}; SLICING: [{id,title,blockedBy}]; IMPLEMENTING: {ticketId,commit,tests,typecheck}; REVIEWING: {ticketId,standardsFindings,specFindings}.",
      parameters: Type.Object({ payload: Type.String() }),
      execute: async (_id, { payload }) => {
        const input: unknown = JSON.parse(payload);
        const candidate = await propose(workflow, input);
        await store.save(workflow.state);
        return notice(`Candidate ${candidate.id} recorded. Ask the operator to run /crust approve ${candidate.id}.`, candidate.id);
      },
    }));
    pi.registerCommand("crust", {
      description: "Crust workflow control: status | approve <proposal-id> | reject <proposal-id> [reason] | advance",
      handler: async (args, ctx) => {
        const [command = "status", proposalId, ...reason] = args.trim().split(/\s+/);
        if (command === "status") { ctx.ui.notify(`Crust ${workflow.state.id}: ${workflow.state.phase}; active ticket: ${workflow.state.activeTicketId ?? "none"}`); return; }
        if (command === "approve" || command === "reject") {
          if (!proposalId) throw new Error(`/crust ${command} requires a proposal ID`);
          if (command === "approve" && !await ctx.ui.confirm("Approve Crust proposal", `Accept ${proposalId}?`)) return;
          const proposal = command === "approve" ? workflow.approve(proposalId, "pi-tui-operator", reason.join(" ") || undefined) : workflow.reject(proposalId, "pi-tui-operator", reason.join(" ") || undefined);
          await store.save(workflow.state);
          const ready = command === "approve" && phaseReady(workflow) ? " Receipt is ready; run /crust advance to request phase transition." : "";
          ctx.ui.notify(`${proposal.id} ${proposal.status}.${ready}`); return;
        }
        if (command === "advance") {
          const phase = workflow.state.phase;
          if (!await ctx.ui.confirm("Advance Crust phase", `Commit ${phase} receipt and advance the workflow?`)) return;
          const receipt = workflow.advance("pi-tui-operator");
          await store.save(workflow.state);
          ctx.ui.notify(`${receipt.schema} persisted; phase is now ${workflow.state.phase}. Exit and resume this run for a fresh locked ${workflow.state.phase} Context window.`); return;
        }
        throw new Error(`unknown /crust command: ${command}`);
      },
    });
    pi.on("session_start", (_event, ctx) => ctx.ui.setStatus("crust", `Crust: ${workflow.state.phase} · ${workflow.state.id}`));
  };
}

async function propose(workflow: PocockWorkflow, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("phase outcome must be a JSON object or array");
  switch (workflow.state.phase) {
    case "SPECIFYING": { const { reference } = input as { reference?: string }; if (!reference) throw new Error("SPECIFYING requires reference"); return workflow.proposeSpec(reference, await readFile(resolve(reference), "utf8")); }
    case "SLICING": return workflow.proposeSlices(input as Array<{ id: string; title: string; blockedBy: string[] }>);
    case "IMPLEMENTING": return workflow.proposeImplementation(input as { ticketId: string; commit: string; tests: string[]; typecheck: string });
    case "REVIEWING": return workflow.proposeReview(input as { ticketId: string; standardsFindings: string[]; specFindings: string[] });
    case "GRILLING": throw new Error("use propose_decision during GRILLING");
    case "DONE": throw new Error("workflow is DONE");
  }
}
function notice(text: string, candidateId: string) { return { content: [{ type: "text" as const, text }], details: { candidateId } }; }
function phaseReady(workflow: PocockWorkflow): boolean {
  const state = workflow.state;
  if (state.phase === "GRILLING") return state.questions.filter((q) => q.required).every((q) => q.status === "accepted");
  if (state.phase === "SPECIFYING") return state.spec?.status === "accepted";
  if (state.phase === "SLICING") return state.slices?.status === "accepted";
  if (state.phase === "IMPLEMENTING") return state.implementation?.status === "accepted";
  return state.phase === "REVIEWING" && state.review?.status === "accepted";
}
