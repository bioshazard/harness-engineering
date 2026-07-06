import {
  createPrompt,
  getPrompt,
  promptVersion,
} from "@arizeai/phoenix-client/prompts";
import { phoenixClient } from "../../../src/registry/phoenix.js";

const endpoint =
  process.env.PHOENIX_ENDPOINT ??
  process.env.PHOENIX_HOST ??
  "https://phoenix.talos.bios.dev";
const apiKey = process.env.PHOENIX_API_KEY;
if (!apiKey) throw new Error("PHOENIX_API_KEY is required");
const client = phoenixClient(endpoint, apiKey);
const name = "dependency-upgrade-remediator";
const existing = await getPrompt({ client, prompt: { name } });
const prompt =
  existing ??
  (await createPrompt({
    client,
    name,
    description:
      "Bounded remediation instructions for the composition-registry tracer bullet.",
    version: promptVersion({
      modelProvider: "OPENAI",
      modelName: "openrouter/free",
      template: [
        {
          role: "system",
          content:
            "Repair only src/minimatch-adapter.ts. Preserve its exported interface. One whole-file replacement is permitted; all other mutations are forbidden.",
        },
      ],
    }),
  }));
process.stdout.write(`${JSON.stringify({ name, versionId: prompt.id })}\n`);
