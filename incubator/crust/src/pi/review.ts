import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface ReviewAxesInput {
  cwd: string;
  provider: string;
  model: string;
  thinking: string;
  specification: string;
  ticket: string;
  signal: AbortSignal | undefined;
}

export async function runReviewAxes(input: ReviewAxesInput): Promise<{ standards: string; specification: string }> {
  const common = `Review the repository read-only. Never modify files. Active ticket:\n${input.ticket}\n\nAccepted specification:\n${input.specification}\n\nReport concrete findings with file paths and evidence. Under 400 words.`;
  const standards = `${common}\n\nStandards axis: assess quality, security, maintainability, documented repository conventions, and these Fowler heuristics: mysterious names, duplication, feature envy, data clumps, primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle men. Label heuristic findings as judgement calls. Do not assess specification coverage.`;
  const specification = `${common}\n\nSpecification axis: assess only whether the implementation satisfies this active ticket and the accepted specification. Report missing/partial requirements, scope creep into later tickets, and apparently implemented behavior that is wrong. Do not assess general code style.`;
  const [standardsOutput, specificationOutput] = await Promise.all([runPi(input, standards), runPi(input, specification)]);
  return { standards: standardsOutput, specification: specificationOutput };
}

function runPi(input: ReviewAxesInput, prompt: string): Promise<string> {
  const configured = process.env.CRUST_PI_BIN;
  const currentScript = process.argv[1];
  const command = configured ?? (currentScript && existsSync(currentScript) ? process.execPath : "pi");
  const prefix = configured ? [] : currentScript && existsSync(currentScript) ? [currentScript] : [];
  const args = [...prefix,
    "--print", "--mode", "text", "--no-session", "--no-extensions", "--no-skills",
    "--no-prompt-templates", "--no-context-files", "--tools", "read,grep,find,ls",
    "--provider", input.provider, "--model", input.model, "--thinking", input.thinking, prompt,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: input.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const abort = () => child.kill("SIGTERM");
    input.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      input.signal?.removeEventListener("abort", abort);
      if (code === 0 && stdout.trim()) resolve(stdout.trim());
      else reject(new Error(`Review subagent failed (${code ?? "unknown"}): ${stderr.trim() || "no output"}`));
    });
  });
}
