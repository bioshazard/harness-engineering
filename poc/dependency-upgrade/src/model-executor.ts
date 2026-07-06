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

export type ModelInvocation = {
  provider: string;
  requestedModel: string;
  systemPrompt: string;
  userPrompt: string;
};

export type ModelInvocationResult = {
  responseModel: string;
  responseId?: string;
  stopReason?: string;
  content: Array<
    | { type: "text"; text: string }
    | {
        type: "toolCall";
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }
  >;
  usage?: {
    input: number;
    output: number;
    totalTokens: number;
    cost: { total: number };
  };
};

export type ModelInvocationObserver = {
  run(
    input: ModelInvocation,
    invoke: (signal?: AbortSignal) => Promise<ModelInvocationResult>,
  ): Promise<ModelInvocationResult>;
};

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
  systemPrompt?: string;
  promptVersion?: string;
  observer?: ModelInvocationObserver;
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
      const systemPrompt =
        input.systemPrompt ??
        "You repair one TypeScript dependency adapter. Emit exactly one replace_adapter call. Preserve the exported interface. Do not use markdown fences.";
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
        systemPrompt,
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
      const userPrompt = `${intent}

Compiler diagnostics:
${JSON.stringify(diagnostics)}

Current adapter:
${context.adapter}

Installed minimatch declarations:
${context.declarations}`;
      const invoke = async (
        signal?: AbortSignal,
      ): Promise<ModelInvocationResult> => {
        const abort = () => void session.abort();
        signal?.addEventListener("abort", abort, { once: true });
        try {
          await session.prompt(userPrompt);
        } finally {
          signal?.removeEventListener("abort", abort);
        }
        const assistants = session.messages.filter(
          (message) => message.role === "assistant",
        );
        const assistant = [...assistants]
          .reverse()
          .find((message) => message.content.length > 0) ?? assistants.at(-1);
        if (!assistant || assistant.role !== "assistant") {
          throw new Error("model returned no assistant message");
        }
        const content: ModelInvocationResult["content"] = [];
        for (const message of assistants) {
          for (const item of message.content) {
            if (item.type === "text") {
              content.push({ type: "text", text: item.text });
            } else if (item.type === "toolCall") {
              content.push({
                type: "toolCall",
                id: item.id,
                name: item.name,
                arguments: item.arguments,
              });
            }
          }
        }
        const usage = assistants.reduce(
          (total, message) => ({
            input: total.input + message.usage.input,
            output: total.output + message.usage.output,
            totalTokens: total.totalTokens + message.usage.totalTokens,
            cost: { total: total.cost.total + message.usage.cost.total },
          }),
          { input: 0, output: 0, totalTokens: 0, cost: { total: 0 } },
        );
        return {
          responseModel: assistant.responseModel ?? assistant.model,
          responseId: assistant.responseId,
          stopReason: assistant.stopReason,
          content,
          usage,
        };
      };
      try {
        const invocation = {
          provider: "openrouter",
          requestedModel: input.modelId,
          systemPrompt,
          userPrompt,
        };
        const result = input.observer
          ? await input.observer.run(invocation, invoke)
          : await invoke();
        responseModel = result.responseModel;
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
              promptVersion: input.promptVersion,
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
