import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { helloExtension } from "./extension.js";
import {
  type RunEvidence,
  EXPECTED_CONTENT,
  TARGET_PATH,
  allowedTarget,
  makeReceipt,
} from "./harness.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelsPath = join(root, "config", "models.json");
const modelId = process.env.OPENROUTER_MODEL ?? "openrouter/free";
const apiKey = process.env.OPENROUTER_API_KEY;

async function main(): Promise<number> {
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is required");
    return 2;
  }

  await rm(join(root, "sandbox"), { recursive: true, force: true });
  await mkdir(dirname(allowedTarget(root)), { recursive: true });

  const evidence: RunEvidence = {};
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openrouter", apiKey);
  const modelRegistry = ModelRegistry.create(authStorage, modelsPath);
  const model = modelRegistry.find("openrouter", modelId);

  if (!model) {
    console.error(`OpenRouter model not found: ${modelId}`);
    return 2;
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir: join(root, "config"),
    extensionFactories: [helloExtension(root, evidence)],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt:
      "Pursue the user's intent using the available tool. Do not claim success without using it.",
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: root,
    agentDir: join(root, "config"),
    model,
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: ["write_file"],
    sessionManager: SessionManager.inMemory(root),
    settingsManager: SettingsManager.inMemory(),
  });

  let responseModel: string | undefined;
  let runtimeError: string | undefined;
  try {
    await session.prompt(
      `Ensure ${TARGET_PATH} contains exactly: ${EXPECTED_CONTENT}`,
    );
  } catch (error) {
    if (!evidence.guard && !evidence.tool) throw error;
  } finally {
    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index];
      if (message.role === "assistant") {
        responseModel = message.responseModel;
        if (message.stopReason === "error") {
          runtimeError = message.errorMessage ?? "model request failed";
        }
        break;
      }
    }
    session.dispose();
  }

  if (runtimeError) throw new Error(runtimeError);

  const receipt = await makeReceipt(root, evidence, responseModel ?? model.id);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return receipt.verdict === "success" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
