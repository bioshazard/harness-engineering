import { homedir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { ArtifactSpecSchema, validateArtifactSpec, type ArtifactSpec } from "./artifact";
import { loadPiCredentials } from "./credentials";
import { artifactCanClearGap } from "./game-engine";

const SYSTEM_PROMPT = `You are the artifact imagination worker inside a small side-scrolling game.
The player faces a six-unit-wide gap. Invent one useful artifact from their request.
You have exactly one capability: submit_artifact. Call it exactly once.
Express all appearance using its bounded primitive grammar and choose exactly one
affordance. A support must span the complete gap; propulsion must launch across
it. Do not describe code, files, tools, or implementation. Interesting,
surprising designs are welcome, but the artifact must clear the gap.`;

export async function forgeWithPi(prompt: string): Promise<{
  model: string;
  spec: ArtifactSpec;
}> {
  const credentials = await loadPiCredentials(
    process.env.PI_AUTH_FILE ?? join(homedir(), ".pi", "agent", "auth.json"),
  );
  const models = builtinModels({ credentials });
  const provider = process.env.PI_PROVIDER ?? "openai-codex";
  const modelId = process.env.PI_MODEL ?? "gpt-5.4";
  const model = models.getModel(provider, modelId);
  if (!model) throw new Error(`Pi model unavailable: ${provider}/${modelId}`);
  if (!(await credentials.read(provider))) {
    throw new Error(`Pi credential unavailable for ${provider}`);
  }

  let proposal: ArtifactSpec | undefined;
  const submitArtifact: AgentTool = {
    name: "submit_artifact",
    label: "Submit artifact",
    description:
      "Submit the complete bounded artifact proposal. This is your only game capability.",
    parameters: ArtifactSpecSchema,
    async execute(_toolCallId, params) {
      if (proposal) throw new Error("only one artifact may be submitted");
      const candidate = validateArtifactSpec(params);
      if (!artifactCanClearGap(candidate)) {
        throw new Error("artifact does not span or clear the complete gap");
      }
      proposal = candidate;
      return {
        content: [{ type: "text", text: "Artifact proposal accepted by the harness." }],
        details: { accepted: true },
      };
    },
  };

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: [submitArtifact],
    },
    streamFn: (activeModel, context, options) =>
      models.streamSimple(activeModel, context, options),
    toolExecution: "sequential",
  });

  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await agent.prompt(`Player request: ${prompt}`);
        if (!proposal) {
          await agent.prompt(
            "No artifact was submitted. Call submit_artifact now with one complete proposal. Do not answer with prose.",
          );
        }
      })(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          agent.abort();
          reject(new Error("artifact generation exceeded 60 seconds"));
        }, 60_000);
      }),
    ]);
  } finally {
    if (deadline) clearTimeout(deadline);
    agent.abort();
  }
  if (!proposal) throw new Error("Pi finished without submitting an artifact");
  return { model: `${provider}/${model.id}`, spec: proposal };
}
