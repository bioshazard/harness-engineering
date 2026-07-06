import { getLLMAttributes, traceLLM } from "@arizeai/phoenix-otel";
import type {
  ModelInvocation,
  ModelInvocationObserver,
  ModelInvocationResult,
} from "../../dependency-upgrade/src/model-executor.js";

export function openInferenceModelObserver(): ModelInvocationObserver {
  return {
    run(input, invoke) {
      const traced = traceLLM(
        async (_input: ModelInvocation) => invoke(),
        {
          name: "openrouter.chat",
          processInput: (invocation) =>
            getLLMAttributes({
              provider: invocation.provider,
              system: invocation.provider,
              modelName: invocation.requestedModel,
              invocationParameters: {
                model: invocation.requestedModel,
                tools: ["replace_adapter"],
              },
              inputMessages: [
                { role: "system", content: invocation.systemPrompt },
                { role: "user", content: invocation.userPrompt },
              ],
              tools: [
                {
                  jsonSchema: {
                    type: "function",
                    function: {
                      name: "replace_adapter",
                      description:
                        "Propose one whole-file replacement for the dependency adapter.",
                      parameters: {
                        type: "object",
                        properties: {
                          path: { type: "string" },
                          content: { type: "string" },
                        },
                        required: ["path", "content"],
                      },
                    },
                  },
                },
              ],
            }),
          processOutput: modelOutputAttributes,
        },
      );
      return traced(input);
    },
  };
}

export function modelOutputAttributes(result: ModelInvocationResult) {
  const toolCalls = result.content
    .filter((item) => item.type === "toolCall")
    .map((item) => ({
      id: item.id,
      function: { name: item.name, arguments: item.arguments },
    }));
  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  return {
    ...getLLMAttributes({
      modelName: result.responseModel,
      outputMessages: [{
        role: "assistant",
        ...(text ? { content: text } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
      }],
      tokenCount: result.usage
        ? {
            prompt: result.usage.input,
            completion: result.usage.output,
            total: result.usage.totalTokens,
          }
        : undefined,
    }),
    ...(result.responseId ? { "llm.response.id": result.responseId } : {}),
    ...(result.stopReason
      ? { "llm.response.finish_reason": result.stopReason }
      : {}),
    ...(result.usage ? { "llm.cost.total": result.usage.cost.total } : {}),
  };
}
