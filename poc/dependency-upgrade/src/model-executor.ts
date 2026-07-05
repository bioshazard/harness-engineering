import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  ADAPTER_PATH,
  type Proposal,
  type RemediateChild,
  type RemediateReceipt,
} from "./contracts.js";
import { receiptId, writeArtifact } from "./evidence.js";
import { authorizeAndReplace, remediationContext } from "./remediation.js";

function replacementExtension(
  workspace: string,
  proposals: Proposal[],
  decisions: Awaited<ReturnType<typeof authorizeAndReplace>>[],
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "replace_adapter",
      label: "Replace dependency adapter",
      description:
        "Propose one whole-file UTF-8 replacement. Only the exact adapter path can be authorized.",
      parameters: Type.Object({
        path: Type.String(),
        content: Type.String(),
      }),
      async execute(_id, input: Proposal) {
        const proposal = { path: input.path, content: input.content };
        proposals.push(proposal);
        const result = await authorizeAndReplace(
          workspace,
          proposal,
          proposals.length,
        );
        decisions.push(result);
        if (result.authority.verdict === "block") {
          throw new Error(result.authority.reason);
        }
        return {
          content: [{ type: "text", text: "Authorized replacement applied." }],
          details: {},
        };
      },
    });
    pi.on("tool_result", (_event, context) => context.abort());
  };
}

export function modelRemediationChild(input: {
  artifactRoot: string;
  configRoot: string;
  apiKey: string;
  modelId: string;
}): RemediateChild {
  return {
    async run({ workspace, intent, diagnostics }): Promise<RemediateReceipt> {
      const context = await remediationContext(workspace);
      const proposals: Proposal[] = [];
      const decisions: Awaited<ReturnType<typeof authorizeAndReplace>>[] = [];
      const authStorage = AuthStorage.inMemory();
      authStorage.setRuntimeApiKey("openrouter", input.apiKey);
      const modelsPath = join(input.configRoot, "models.json");
      const modelRegistry = ModelRegistry.create(authStorage, modelsPath);
      const model = modelRegistry.find("openrouter", input.modelId);
      if (!model) throw new Error(`OpenRouter model not found: ${input.modelId}`);
      const resourceLoader = new DefaultResourceLoader({
        cwd: workspace,
        agentDir: input.configRoot,
        extensionFactories: [
          replacementExtension(workspace, proposals, decisions),
        ],
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt:
          "You repair one TypeScript dependency adapter. Emit exactly one replace_adapter call. Preserve the exported interface. Do not use markdown fences.",
      });
      await resourceLoader.reload();
      const { session } = await createAgentSession({
        cwd: workspace,
        agentDir: input.configRoot,
        model,
        authStorage,
        modelRegistry,
        resourceLoader,
        tools: ["replace_adapter"],
        sessionManager: SessionManager.inMemory(workspace),
        settingsManager: SettingsManager.inMemory(),
      });
      let responseModel = model.id;
      try {
        await session.prompt(`${intent}

Compiler diagnostics:
${JSON.stringify(diagnostics)}

Current adapter:
${context.adapter}

Installed minimatch declarations:
${context.declarations}`);
      } catch (error) {
        if (!decisions.some((result) => result.authority.verdict === "block")) {
          throw error;
        }
      } finally {
        for (let index = session.messages.length - 1; index >= 0; index -= 1) {
          const message = session.messages[index];
          if (message.role === "assistant") {
            responseModel = message.responseModel ?? responseModel;
            break;
          }
        }
        session.dispose();
      }
      const proposal = proposals[0] ?? { path: "", content: "" };
      const result = decisions[0] ?? {
        authority: {
          verdict: "block" as const,
          path: proposal.path,
          reason: "Executor emitted no Proposal",
        },
        effect: "not_run" as const,
      };
      const artifacts = [
        await writeArtifact(
          input.artifactRoot,
          "model-context.json",
          `${JSON.stringify(
            {
              intent,
              diagnostics,
              adapter: context.adapter,
              declarationsSha256: (
                await import("./evidence.js")
              ).sha256(context.declarations),
            },
            null,
            2,
          )}\n`,
        ),
        await writeArtifact(
          input.artifactRoot,
          "model-proposal.json",
          `${JSON.stringify(proposal, null, 2)}\n`,
        ),
      ];
      const partial = {
        kind: "remediate" as const,
        verdict:
          result.authority.verdict === "allow" ? ("pass" as const) : ("fail" as const),
        proposal,
        authority: result.authority,
        effect: result.effect,
        executor: { provider: "openrouter", model: responseModel },
        artifacts,
      };
      return { ...partial, id: receiptId(partial) };
    },
  };
}
