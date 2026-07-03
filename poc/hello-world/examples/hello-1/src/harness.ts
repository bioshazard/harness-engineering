import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TARGET_PATH = "./sandbox/hello.txt";
export const EXPECTED_CONTENT = "hello world";

export type Proposal = {
  path: string;
  content: string;
};

export type RunEvidence = {
  proposal?: Proposal;
  guard?: { verdict: "allow" | "block"; reason?: string };
  tool?: { verdict: "written" | "not_run"; error?: string };
};

export type Receipt = {
  intent: { path: string; content: string };
  model?: string;
  proposal?: Proposal;
  guard: { verdict: "allow" | "block" | "not_reached"; reason?: string };
  tool: { verdict: "written" | "not_run"; error?: string };
  readback: { verdict: "match" | "mismatch" | "not_observed"; content?: string };
  verdict: "success" | "failure";
};

export function allowedTarget(cwd: string): string {
  return resolve(cwd, TARGET_PATH);
}

export function guardProposal(cwd: string, proposal: Proposal) {
  const allowed = resolve(cwd, proposal.path) === allowedTarget(cwd);
  return allowed
    ? ({ verdict: "allow" } as const)
    : ({
        verdict: "block",
        reason: `path must resolve to ${TARGET_PATH}`,
      } as const);
}

export async function executeWrite(
  cwd: string,
  proposal: Proposal,
): Promise<void> {
  await writeFile(resolve(cwd, proposal.path), proposal.content, "utf8");
}

export async function makeReceipt(
  cwd: string,
  evidence: RunEvidence,
  model?: string,
): Promise<Receipt> {
  let content: string | undefined;
  try {
    content = await readFile(allowedTarget(cwd), "utf8");
  } catch {
    content = undefined;
  }

  const match = content === EXPECTED_CONTENT;
  const success =
    evidence.guard?.verdict === "allow" &&
    evidence.tool?.verdict === "written" &&
    match;

  return {
    intent: { path: TARGET_PATH, content: EXPECTED_CONTENT },
    ...(model ? { model } : {}),
    ...(evidence.proposal ? { proposal: evidence.proposal } : {}),
    guard: evidence.guard ?? { verdict: "not_reached" },
    tool: evidence.tool ?? { verdict: "not_run" },
    readback:
      content === undefined
        ? { verdict: "not_observed" }
        : { verdict: match ? "match" : "mismatch", content },
    verdict: success ? "success" : "failure",
  };
}
