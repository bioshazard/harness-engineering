import { FactoryMachine } from "./machine.js";
import { agentCoreBuildWorker } from "./worker.js";

async function main(): Promise<number> {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length > 0) {
    console.error("usage: bun src/factory/main.ts '<single build request>'");
    return 2;
  }
  const machine = new FactoryMachine(
    agentCoreBuildWorker({
      provider: process.env.PI_PROVIDER ?? "openai-codex",
      modelId: process.env.PI_MODEL ?? "gpt-5.4",
      mcpUrl: process.env.MCP_URL ?? "http://devbox:3000/mcp",
      buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MS ?? "120000"),
      authPath: process.env.PI_AUTH_PATH ?? "/run/pi-auth/auth.json",
      apiKey: process.env.OPENROUTER_API_KEY,
    }),
  );
  const state = await machine.build(input);
  process.stdout.write(`${JSON.stringify(state)}\n`);
  return state.stage === "succeeded" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
