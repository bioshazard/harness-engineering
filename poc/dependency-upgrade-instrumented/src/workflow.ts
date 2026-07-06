import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  workflow,
  type Json,
  type LockedContext,
} from "../../../src/registry/index.js";
import {
  realUpgradeChild,
  realVerifyChild,
} from "../../dependency-upgrade/src/children.js";
import {
  ADAPTER_PATH,
  type RemediateChild,
  type UpgradeChild,
  type VerifyChild,
} from "../../dependency-upgrade/src/contracts.js";
import { sha256 } from "../../dependency-upgrade/src/evidence.js";
import { runMesoHarness } from "../../dependency-upgrade/src/parent.js";
import { proposalRemediationChild } from "../../dependency-upgrade/src/remediation.js";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const frozenRoot = resolve(here, "../../dependency-upgrade");

export type UpgradeIntent = {
  dependency: "minimatch@9.0.9";
};

function tracedVerify(context: LockedContext, child: VerifyChild): VerifyChild {
  return {
    run(input) {
      return context.transition(
        `verify:${input.label}`,
        ["workflow", "independent-verifier"],
        () => child.run(input),
      );
    },
  };
}

function tracedUpgrade(
  context: LockedContext,
  child: UpgradeChild,
): UpgradeChild {
  return {
    run(input) {
      return context.transition(
        "upgrade",
        ["workflow", "npm-capability", "upgrade-policy"],
        () => child.run(input),
      );
    },
  };
}

function tracedRemediation(
  context: LockedContext,
  child: RemediateChild,
): RemediateChild {
  return {
    run(input) {
      return context.transition(
        "authorize-remediation",
        ["workflow", "remediation-prompt", "mutation-policy"],
        () => child.run(input),
      );
    },
  };
}

export const dependencyUpgradeWorkflow = workflow(
  "poc/dependency-upgrade-instrumented/src/workflow.ts",
  async (context, intent: UpgradeIntent) => {
    if (intent.dependency !== "minimatch@9.0.9") {
      throw new Error(`unsupported dependency intent: ${intent.dependency}`);
    }
    const prompt = context.prompt("remediation-prompt");
    const runRoot = await mkdtemp(join(tmpdir(), "composed-dependency-upgrade-"));
    const workspace = join(runRoot, "candidate");
    const artifacts = join(runRoot, "artifacts");
    let accepted = false;
    try {
      await cp(join(frozenRoot, "fixture"), workspace, {
        recursive: true,
        filter: (source) => !source.includes("node_modules"),
      });
      await context.transition(
        "prepare-workspace",
        ["workflow", "npm-capability"],
        async () => {
          await execFileAsync("npm", ["ci", "--ignore-scripts"], {
            cwd: workspace,
            maxBuffer: 4 * 1024 * 1024,
          });
        },
      );
      const npmVersion = (await execFileAsync("npm", ["--version"])).stdout.trim();
      const fixtureLock = await readFile(join(workspace, "package-lock.json"));
      const verify = tracedVerify(context, realVerifyChild(artifacts));
      const upgrade = tracedUpgrade(context, realUpgradeChild(artifacts));
      const remediation = tracedRemediation(
        context,
        proposalRemediationChild(
          {
            path: ADAPTER_PATH,
            content:
              'import { minimatch } from "minimatch";\n\nexport function matchesSelection(path: string, pattern: string): boolean {\n  return minimatch(path, pattern);\n}\n',
          },
          artifacts,
          prompt.immutableId,
        ),
      );
      const parent = await runMesoHarness({
        workspace,
        fixtureIdentity: `fixture-lock-sha256:${sha256(fixtureLock)}`,
        verify,
        upgrade,
        remediate: remediation,
        npmVersion,
      });
      accepted = parent.terminalVerdict === "accept";
      return {
        terminalVerdict: parent.terminalVerdict,
        domain: {
          ...parent,
          runRoot,
          lockedPromptVersion: prompt.immutableId,
        } as unknown as Json,
        authorityDecisions: parent.authorityDecisions as unknown as Json[],
        evaluatorIdentities: context.components
          .filter((component) => component.category === "evaluators")
          .map((component) => component.immutableId),
        artifacts: parent.artifacts,
      };
    } finally {
      if (!accepted && process.env.KEEP_WORKSPACE !== "1") {
        await rm(runRoot, { recursive: true, force: true });
      }
    }
  },
);
