import { writeFile } from "node:fs/promises";
import { dependencyUpgradeSystem } from "./system.js";

const live = process.argv.includes("--live");
const allowExternalModel = process.argv.includes("--allow-external-model");

if (live && !process.env.PHOENIX_API_KEY) {
  throw new Error("PHOENIX_API_KEY is required for --live");
}
if (allowExternalModel && !process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required for --allow-external-model");
}

const system = await dependencyUpgradeSystem({ live, allowExternalModel });
const receipt = await system.run({ dependency: "minimatch@9.0.9" });
const path = `.goal-systems/receipts/${receipt.runId}.json`;
await import("node:fs/promises").then(({ mkdir }) =>
  mkdir(".goal-systems/receipts", { recursive: true }),
);
await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      compositionId: system.compositionId,
      manifestVersionId: system.manifestVersionId,
      runId: receipt.runId,
      traceId: receipt.traceId,
      terminalVerdict: receipt.terminalVerdict,
      receipt: path,
    },
    null,
    2,
  )}\n`,
);
process.exitCode = receipt.terminalVerdict === "accept" ? 0 : 1;
