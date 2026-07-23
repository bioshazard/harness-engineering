import "server-only";

import { join } from "node:path";
import type { ArtifactSpec } from "./artifact";

export async function forgeInHarnessProcess(prompt: string): Promise<{
  model: string;
  spec: ArtifactSpec;
}> {
  const workerPath = join(process.cwd(), "scripts", "forge-agent.ts");
  const child = Bun.spawn({
    cmd: [process.execPath, "run", workerPath, JSON.stringify({ prompt })],
    cwd: process.cwd(),
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `Pi worker exited ${exitCode}`);
  }
  const parsed = JSON.parse(stdout) as {
    model?: unknown;
    spec?: unknown;
  };
  if (typeof parsed.model !== "string" || !parsed.spec) {
    throw new Error("Pi worker returned an invalid envelope");
  }
  return { model: parsed.model, spec: parsed.spec as ArtifactSpec };
}
