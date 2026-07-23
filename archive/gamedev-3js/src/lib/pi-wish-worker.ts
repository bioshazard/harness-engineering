import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { WishWorker } from "./wish-loop";

const provider = "openai-codex";
const codexBaseUrl = "https://chatgpt.com/backend-api";
const imageModel = "gpt-image-2";

type Proposal = Awaited<ReturnType<WishWorker>>;

function accountIdFromToken(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("OpenAI Codex OAuth token is not a JWT.");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
  };
  const accountId =
    claims["https://api.openai.com/auth"]?.chatgpt_account_id;
  if (!accountId) throw new Error("OpenAI Codex account id is unavailable.");
  return accountId;
}

async function imageFromSse(response: Response, signal?: AbortSignal) {
  if (!response.body) throw new Error("Image response has no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Wish image generation aborted.");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data && data !== "[DONE]") {
          const event = JSON.parse(data) as {
            type?: string;
            message?: string;
            response?: { error?: { message?: string } };
            item?: { type?: string; result?: string };
          };
          if (event.type === "error" || event.type === "response.failed") {
            throw new Error(
              event.message ??
                event.response?.error?.message ??
                "Codex image generation failed.",
            );
          }
          if (
            event.type === "response.output_item.done" &&
            event.item?.type === "image_generation_call" &&
            event.item.result
          ) {
            return event.item.result;
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("Codex returned no generated image.");
}

async function generateImage(
  prompt: string,
  outputPath: string,
  responseModel: string,
  token: string,
  signal?: AbortSignal,
) {
  const requestId = randomUUID();
  const response = await fetch(`${codexBaseUrl}/codex/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "chatgpt-account-id": accountIdFromToken(token),
      originator: "wish-garden-pi-worker",
      "OpenAI-Beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      session_id: requestId,
      "x-client-request-id": requestId,
    },
    body: JSON.stringify({
      model: responseModel,
      store: false,
      stream: true,
      instructions:
        "Use image_generation once. Generate only the requested game sprite.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Generate this image: ${prompt}. Isolated full-body magical game creature, centered, transparent background, no text, no border, whimsical moonlit storybook sprite matching Wish Garden.`,
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          model: imageModel,
          size: "1024x1024",
          quality: "medium",
          background: "transparent",
          output_format: "png",
          moderation: "auto",
        },
      ],
      tool_choice: "auto",
      parallel_tool_calls: false,
      text: { verbosity: "low" },
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Codex image generation failed (${response.status}).`);
  }
  const image = await imageFromSse(response, signal);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(image, "base64"));
}

function wishExtension(
  imagePath: string,
  capture: (proposal: Proposal) => void,
) {
  return (pi: ExtensionAPI) => {
    let submitted = false;
    pi.registerTool({
      name: "propose_wish",
      label: "Propose wish",
      description:
        "Submit one bounded Wish Garden creature and generate its PNG sprite.",
      parameters: Type.Object({
        label: Type.String({ minLength: 1, maxLength: 60 }),
        summary: Type.String({ minLength: 1, maxLength: 120 }),
        motion: Type.Union([
          Type.Literal("wander"),
          Type.Literal("follow-player"),
          Type.Literal("orbit-tree"),
          Type.Literal("hunt-lanterns"),
        ]),
        speed: Type.Number({ minimum: 0.2, maximum: 1.2 }),
        visualPrompt: Type.String({ minLength: 3, maxLength: 500 }),
      }),
      async execute(_id, params, signal, _update, ctx) {
        if (submitted) throw new Error("Only one wish proposal is allowed.");
        submitted = true;
        const token = await ctx.modelRegistry.getApiKeyForProvider(provider);
        if (!token) {
          throw new Error(
            "Pi OpenAI Codex OAuth is unavailable. Run pi /login first.",
          );
        }
        const responseModel =
          ctx.model?.provider === provider ? ctx.model.id : "gpt-5.4";
        await generateImage(
          params.visualPrompt,
          imagePath,
          responseModel,
          token,
          signal,
        );
        capture({
          label: params.label,
          behavior: {
            motion: params.motion,
            speed: params.speed,
            summary: params.summary,
          },
          model: `${provider}/${responseModel}+${imageModel}`,
        });
        return {
          content: [{ type: "text", text: "Wish proposal captured." }],
          details: {},
        };
      },
    });
  };
}

export const runPiWishWorker: WishWorker = async ({
  description,
  imagePath,
}) => {
  const authStorage = AuthStorage.create(process.env.PI_AUTH_PATH);
  const modelRegistry = ModelRegistry.create(authStorage);
  const modelId = process.env.PI_WISH_MODEL ?? "gpt-5.4";
  const model = modelRegistry.find(provider, modelId);
  if (!model) throw new Error(`Pi model not found: ${provider}/${modelId}`);
  if (!modelRegistry.isUsingOAuth(model)) {
    throw new Error("Wish worker requires Pi OpenAI Codex subscription auth.");
  }
  const agentDirectory = path.join(process.cwd(), "data", "pi-agent");
  let proposal: Proposal | undefined;
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: agentDirectory,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      wishExtension(imagePath, (value) => {
        proposal = value;
      }),
    ],
    systemPrompt:
      "Fulfill one Wish Garden request. Call propose_wish exactly once. Choose only behavior the schema permits. Make the label and visual prompt faithful to the request. Then stop.",
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    agentDir: agentDirectory,
    model,
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: ["propose_wish"],
    sessionManager: SessionManager.inMemory(process.cwd()),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1 },
    }),
    thinkingLevel: "low",
  });
  try {
    await session.prompt(description);
  } finally {
    session.dispose();
  }
  if (!proposal) throw new Error("Pi returned no wish proposal.");
  return proposal;
};
