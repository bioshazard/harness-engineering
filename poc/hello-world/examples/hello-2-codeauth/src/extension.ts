import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  type Authority,
  type ProposalEvidence,
  invokeCapability,
} from "./harness.js";

const readSchema = Type.Object({ path: Type.String() });
const writeSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

export function codeauthExtension(
  root: string,
  authority: Authority,
  evidence: ProposalEvidence[],
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "read_file",
      label: "Read file",
      description: "Read one UTF-8 file, subject to CODEAUTH.",
      parameters: readSchema,
      async execute(_id, input: { path: string }) {
        const proposal = await invokeCapability(
          root,
          authority,
          "read_file",
          input.path,
        );
        evidence.push(proposal);
        if (proposal.guard === "block") throw new Error(proposal.denialReason);
        return {
          content: [{ type: "text", text: proposal.observation ?? "" }],
          details: {},
        };
      },
    });

    pi.registerTool({
      name: "write_file",
      label: "Write file",
      description: "Write one UTF-8 file, subject to CODEAUTH.",
      parameters: writeSchema,
      async execute(_id, input: { path: string; content: string }) {
        const proposal = await invokeCapability(
          root,
          authority,
          "write_file",
          input.path,
          input.content,
        );
        evidence.push(proposal);
        if (proposal.guard === "block") throw new Error(proposal.denialReason);
        return {
          content: [{ type: "text", text: "File written." }],
          details: {},
        };
      },
    });

    pi.on("tool_result", (_event, ctx) => {
      const last = evidence.at(-1);
      if (last?.guard === "block" || last?.capability === "write_file") {
        ctx.abort();
      }
    });
  };
}
