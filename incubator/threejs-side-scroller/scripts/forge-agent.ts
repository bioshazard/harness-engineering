import { forgeWithPi } from "../lib/forge-worker";

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("missing harness input");
  const input = JSON.parse(raw) as { prompt?: unknown };
  if (typeof input.prompt !== "string") throw new Error("invalid harness input");
  const result = await forgeWithPi(input.prompt);
  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Pi worker failed");
  process.exitCode = 1;
});
