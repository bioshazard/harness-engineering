import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { realUpgradeChild, realVerifyChild } from "./children.js";
import { ADAPTER_PATH, LOCKFILE_PATH } from "./contracts.js";
import { sha256 } from "./evidence.js";
import { modelRemediationChild } from "./model-executor.js";
import { runMesoHarness } from "./parent.js";
import { proposalRemediationChild } from "./remediation.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const deterministic = process.env.DETERMINISTIC_REMEDIATION === "1";
  const externalModelApproved = process.argv.includes("--allow-external-model");
  if (!deterministic && !externalModelApproved) {
    throw new Error(
      "model integration requires --allow-external-model because adapter code and diagnostics leave the machine",
    );
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!deterministic && !apiKey) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
  const runRoot = await mkdtemp(join(tmpdir(), "dependency-upgrade-run-"));
  const workspace = join(runRoot, "candidate");
  const artifacts = join(runRoot, "artifacts");
  let preserve = process.env.KEEP_WORKSPACE === "1";
  try {
    await cp(join(root, "fixture"), workspace, {
      recursive: true,
      filter: (source) => !source.includes("node_modules"),
    });
    await execFileAsync("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], {
      cwd: workspace,
      maxBuffer: 4 * 1024 * 1024,
    });
    const bun = (await execFileAsync("bun", ["--version"])).stdout.trim();
    const lock = await readFile(join(workspace, LOCKFILE_PATH));
    const receipt = await runMesoHarness({
      workspace,
      fixtureIdentity: `fixture-lock-sha256:${sha256(lock)}`,
      verify: realVerifyChild(artifacts),
      upgrade: realUpgradeChild(artifacts),
      remediate: deterministic
        ? proposalRemediationChild(
            {
              path: ADAPTER_PATH,
              content:
                'import { minimatch } from "minimatch";\n\nexport function matchesSelection(path: string, pattern: string): boolean {\n  return minimatch(path, pattern);\n}\n',
            },
            artifacts,
            "known-valid-registry-smoke",
          )
        : modelRemediationChild({
            artifactRoot: artifacts,
            configRoot: join(root, "config"),
            apiKey: apiKey!,
            modelId: process.env.OPENROUTER_MODEL ?? "openrouter/free",
          }),
      bunVersion: bun,
    });
    const receiptPath = join(runRoot, "parent-receipt.json");
    await writeFile(
      receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          runRoot,
          workspace:
            receipt.terminalVerdict === "accept" || preserve ? workspace : null,
          receiptPath,
          receipt,
        },
        null,
        2,
      )}\n`,
    );
    preserve ||= receipt.terminalVerdict === "accept";
    return receipt.terminalVerdict === "accept" ? 0 : 1;
  } finally {
    if (!preserve) await rm(workspace, { recursive: true, force: true });
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
