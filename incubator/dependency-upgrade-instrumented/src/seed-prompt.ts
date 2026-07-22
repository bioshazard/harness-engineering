import {
  createPrompt,
  getPrompt,
  promptVersion,
} from "@arizeai/phoenix-client/prompts";
import { phoenixClient } from "../../../src/registry/phoenix.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  PHOENIX_PROMPT_NAME,
} from "./config.js";

const endpoint =
  process.env.PHOENIX_ENDPOINT ??
  process.env.PHOENIX_HOST ??
  "https://phoenix.talos.bios.dev";
const apiKey = process.env.PHOENIX_API_KEY;
if (!apiKey) throw new Error("PHOENIX_API_KEY is required");
const client = phoenixClient(endpoint, apiKey);
const name = PHOENIX_PROMPT_NAME;
const existing = await getPrompt({ client, prompt: { name } });
const version = promptVersion({
  modelProvider: "OPENAI",
  modelName: DEFAULT_OPENROUTER_MODEL,
  template: [
    {
      role: "system",
      content:
        "Repair only src/minimatch-adapter.ts. Preserve its exported interface. One whole-file replacement is permitted; all other mutations are forbidden.",
    },
  ],
});
const prompt =
  existing &&
  existing.model_name === version.model_name &&
  JSON.stringify(existing.template) === JSON.stringify(version.template)
    ? existing
    : await createPrompt({
    client,
    name,
    description:
      "Bounded remediation instructions for the composition-registry tracer bullet.",
    version,
  });
process.stdout.write(`${JSON.stringify({ name, versionId: prompt.id })}\n`);
