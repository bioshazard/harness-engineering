import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { BuildWorker } from "./machine.js";
import { connectDevbox } from "./mcp-tools.js";
import { loadCredentials } from "./credentials.js";

export const SYSTEM_PROMPT =
  "You are a software worker. Fulfill the request inside the dev box using only the available remote tools. Verify the result before finishing.";

function finalText(agent: Agent): string {
  const message = [...agent.state.messages]
    .reverse()
    .find((candidate) => candidate.role === "assistant");
  if (!message || message.role !== "assistant") throw new Error("model returned no assistant message");
  if (message.stopReason === "error") throw new Error(message.errorMessage ?? "model request failed");
  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

export function agentCoreBuildWorker(config: {
  provider: string;
  modelId: string;
  mcpUrl: string;
  buildTimeoutMs: number;
  authPath: string;
  apiKey?: string;
}): BuildWorker {
  return async (input) => {
    const credentials = await loadCredentials(
      config.authPath,
      config.apiKey ? { provider: config.provider, apiKey: config.apiKey } : undefined,
    );
    const models = builtinModels({ credentials });
    const model = models.getModel(config.provider, config.modelId);
    if (!model) throw new Error(`model not found: ${config.provider}/${config.modelId}`);
    if (!(await credentials.read(config.provider))) {
      throw new Error(`no credential for ${config.provider} in ${config.authPath}`);
    }
    const { client, tools } = await connectDevbox(config.mcpUrl);
    const toolNames = tools.map((tool) => tool.name).sort();
    const expected = ["bash", "edit", "read", "write"];
    if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
      await client.close();
      throw new Error(`unexpected dev-box tools: ${toolNames.join(",")}`);
    }
    const agent = new Agent({
      initialState: { systemPrompt: SYSTEM_PROMPT, model, tools },
      streamFn: (activeModel, context, options) =>
        models.streamSimple(activeModel, context, options),
      toolExecution: "sequential",
    });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        agent.prompt(input),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => {
            agent.abort();
            reject(new Error(`build exceeded ${config.buildTimeoutMs}ms`));
          }, config.buildTimeoutMs);
        }),
      ]);
      return { output: finalText(agent), model: model.id };
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      agent.abort();
      await client.close();
    }
  };
}
