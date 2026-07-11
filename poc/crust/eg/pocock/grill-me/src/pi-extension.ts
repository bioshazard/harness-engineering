import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { FileRunStore } from "./store.js";
import { GrillingWorkflow } from "./workflow.js";

export function crustGrillingExtension(workflow: GrillingWorkflow, store: FileRunStore): InlineExtension {
  return {
    name: "crust-grill-me",
    factory: (pi) => {
      pi.registerTool(defineTool({
        name: "propose_decision",
        label: "Propose decision",
        description: "Record a candidate answer to one open grilling question. This does not resolve the decision or advance the workflow; the operator must approve it with /crust approve <decision-id>.",
        parameters: Type.Object({
          questionId: Type.String({ description: "ID of an open question" }),
          decision: Type.String({ description: "Concrete proposed decision" }),
          rationale: Type.String({ description: "Why this decision advances the intent" }),
          alternativesRejected: Type.Array(Type.String(), { description: "Alternatives considered and rejected" }),
          glossaryChanges: Type.Optional(Type.Array(Type.String())),
          adrDraft: Type.Optional(Type.String()),
        }),
        execute: async (_id, proposal) => {
          const candidate = workflow.proposeDecision(proposal);
          await store.save(workflow.state);
          return {
            content: [{
              type: "text",
              text: `Candidate ${candidate.id} recorded. Ask the operator to inspect it and run /crust approve ${candidate.id}, or /crust reject ${candidate.id} <reason>.`,
            }],
            details: { candidateId: candidate.id },
          };
        },
      }));

      pi.registerCommand("crust", {
        description: "Inspect or govern this Crust grilling run: status | approve <id> | reject <id> [reason] | complete",
        handler: async (args, ctx) => {
          const [command = "status", candidateId, ...reason] = args.trim().split(/\s+/);
          if (command === "status") {
            const open = workflow.state.questions.filter((question) => question.status === "open").map((question) => question.id);
            ctx.ui.notify(`Crust ${workflow.state.id}: ${workflow.state.state}; open: ${open.join(", ") || "none"}`);
            return;
          }
          if (command === "approve" || command === "reject") {
            if (!candidateId) throw new Error(`/crust ${command} requires a decision ID`);
            const approved = command === "approve";
            const confirmation = approved
              ? await ctx.ui.confirm("Approve Crust decision", `Accept ${candidateId} and resolve its question?`)
              : true;
            if (!confirmation) return;
            workflow.confirmDecision(candidateId, "pi-tui-operator", approved, reason.join(" ") || undefined);
            await store.save(workflow.state);
            ctx.ui.notify(`${candidateId} ${approved ? "accepted" : "rejected"}`);
            return;
          }
          if (command === "complete") {
            const receipt = workflow.complete();
            await store.save(workflow.state);
            ctx.ui.notify(`GRILLING complete; Receipt ${receipt.schema} persisted.`);
            return;
          }
          throw new Error(`unknown /crust command: ${command}`);
        },
      });

      pi.on("session_start", (_event, ctx) => {
        ctx.ui.setStatus("crust", `Crust: ${workflow.state.state} · ${workflow.state.id}`);
      });
    },
  };
}
