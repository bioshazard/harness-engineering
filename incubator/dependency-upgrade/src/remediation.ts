import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  ADAPTER_PATH,
  type AuthorityDecision,
  type Proposal,
  type RemediateChild,
  type RemediateReceipt,
} from "./contracts.js";
import { receiptId, writeArtifact } from "./evidence.js";

const MAX_REPLACEMENT_BYTES = 16_384;

export async function authorizeAndReplace(
  workspace: string,
  proposal: Proposal,
  proposalNumber = 1,
): Promise<{
  authority: AuthorityDecision;
  effect: "replaced" | "not_run";
}> {
  const absolute = resolve(workspace, proposal.path);
  const normalized = relative(workspace, absolute).split(sep).join("/");
  const block = (reason: string) => ({
    authority: {
      verdict: "block" as const,
      path: normalized || proposal.path,
      reason,
    },
    effect: "not_run" as const,
  });
  if (proposalNumber !== 1) return block("one-Proposal budget exhausted");
  if (normalized !== ADAPTER_PATH) return block("protected path");
  if (Buffer.byteLength(proposal.content) > MAX_REPLACEMENT_BYTES) {
    return block("replacement exceeds byte budget");
  }
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return block("adapter must be a regular non-symlink file");
  }
  const temporary = join(
    dirname(absolute),
    `.${randomUUID()}-adapter-replacement`,
  );
  await writeFile(temporary, proposal.content, {
    encoding: "utf8",
    flag: "wx",
    mode: stat.mode,
  });
  await rename(temporary, absolute);
  return {
    authority: { verdict: "allow", path: normalized },
    effect: "replaced",
  };
}

export function proposalRemediationChild(
  proposal: Proposal,
  artifactRoot: string,
  model = "deterministic-test-double",
): RemediateChild {
  return {
    async run({ workspace, diagnostics }): Promise<RemediateReceipt> {
      const result = await authorizeAndReplace(workspace, proposal);
      const artifacts = [
        await writeArtifact(
          artifactRoot,
          "remediation-context.json",
          `${JSON.stringify({ diagnostics, proposal }, null, 2)}\n`,
        ),
      ];
      const partial = {
        kind: "remediate" as const,
        verdict:
          result.authority.verdict === "allow" ? ("pass" as const) : ("fail" as const),
        proposal,
        authority: result.authority,
        effect: result.effect,
        executor: { provider: "test", model },
        artifacts,
      };
      return { ...partial, id: receiptId(partial) };
    },
  };
}

export async function remediationContext(workspace: string) {
  const packageJson = JSON.parse(
    await readFile(join(workspace, "node_modules/minimatch/package.json"), "utf8"),
  ) as { types?: string; typings?: string };
  const declarationPath = packageJson.types ?? packageJson.typings;
  if (!declarationPath) throw new Error("installed minimatch has no declarations");
  return {
    adapter: await readFile(join(workspace, ADAPTER_PATH), "utf8"),
    declarations: await readFile(
      join(workspace, "node_modules/minimatch", declarationPath),
      "utf8",
    ),
  };
}
