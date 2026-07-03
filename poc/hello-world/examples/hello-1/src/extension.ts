import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  type Proposal,
  type RunEvidence,
  executeWrite,
  guardProposal,
} from "./harness.js";

const writeFileSchema = Type.Object({
  path: Type.String({ description: "Path of the file to write" }),
  content: Type.String({ description: "Complete file contents" }),
});

export function helloExtension(
  cwd: string,
  evidence: RunEvidence,
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "write_file",
      label: "Write file",
      description: "Write complete UTF-8 contents to one file.",
      parameters: writeFileSchema,
      async execute(_toolCallId, proposal: Proposal) {
        try {
          await executeWrite(cwd, proposal);
          evidence.tool = { verdict: "written" };
          return {
            content: [{ type: "text", text: "File written." }],
            details: {},
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          evidence.tool = { verdict: "not_run", error: message };
          throw error;
        }
      },
    });

    pi.on("tool_call", (event, ctx) => {
      if (event.toolName !== "write_file") return;

      if (evidence.proposal) {
        ctx.abort();
        return { block: true, reason: "only one tool proposal is allowed" };
      }

      const proposal = event.input as Proposal;
      evidence.proposal = { path: proposal.path, content: proposal.content };
      evidence.guard = guardProposal(cwd, proposal);

      if (evidence.guard.verdict === "block") {
        evidence.tool = { verdict: "not_run" };
        ctx.abort();
        return { block: true, reason: evidence.guard.reason };
      }
    });

    pi.on("tool_result", (event, ctx) => {
      if (event.toolName === "write_file") ctx.abort();
    });
  };
}
