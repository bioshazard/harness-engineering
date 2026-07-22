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
import { modelRemediationChild } from "../../dependency-upgrade/src/model-executor.js";
import { runMesoHarness } from "../../dependency-upgrade/src/parent.js";
import { proposalRemediationChild } from "../../dependency-upgrade/src/remediation.js";
import { DEFAULT_OPENROUTER_MODEL } from "./config.js";
import { openInferenceModelObserver } from "./openinference.js";

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
        async () => {
          const receipt = await child.run(input);
          context.annotate({
            "goal.evaluation.verdict": receipt.verdict,
            "goal.evaluation.typecheck.verdict": receipt.typecheck,
            "goal.evaluation.tests.verdict": receipt.tests,
            "goal.child_receipt.id": receipt.id,
          });
          return receipt;
        },
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
        ["workflow", "bun-capability", "upgrade-policy"],
        async () => {
          const receipt = await child.run(input);
          context.annotate({
            "goal.upgrade.verdict": receipt.verdict,
            "goal.child_receipt.id": receipt.id,
            "goal.upgrade.changed_file.count": receipt.changedFiles.length,
          });
          return receipt;
        },
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
        [
          "workflow",
          "remediation-prompt",
          "remediation-model",
          "mutation-policy",
        ],
        async () => {
          const receipt = await child.run(input);
          const model = context.components.find(
            (component) => component.name === "remediation-model",
          )!;
          const requestedModel = (
            (model.source as { id?: string }).id ?? model.immutableId
          ).replace(/^openrouter:/, "");
          context.annotate({
            "goal.model.requested.id": requestedModel,
            "goal.model.response.id": receipt.executor.model,
            "goal.prompt.version.id": context.prompt("remediation-prompt")
              .immutableId,
            "goal.authority.verdict": receipt.authority.verdict,
            "goal.child_receipt.id": receipt.id,
          });
          context.event("goal.model.proposal", {
            "goal.proposal.sha256": sha256(
              Buffer.from(JSON.stringify(receipt.proposal)),
            ),
            "goal.proposal.path": receipt.proposal.path,
          });
          context.event("goal.authority.decision", {
            "goal.authority.verdict": receipt.authority.verdict,
            "goal.authority.path": receipt.authority.path,
            "goal.authority.effect": receipt.effect,
          });
          return receipt;
        },
      );
    },
  };
}

export function dependencyUpgradeWorkflow(useExternalModel = false) {
  return workflow(
    "incubator/dependency-upgrade-instrumented/src/workflow.ts",
    async (context, intent: UpgradeIntent) => {
    if (intent.dependency !== "minimatch@9.0.9") {
      throw new Error(`unsupported dependency intent: ${intent.dependency}`);
    }
    const prompt = context.prompt("remediation-prompt");
    const promptSource = prompt.source as {
      template?: {
        type?: string;
        messages?: Array<{ role?: string; content?: string }>;
      };
    };
    const systemPrompt = promptSource.template?.messages?.find(
      (message) => message.role === "system",
    )?.content;
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
        ["workflow", "bun-capability"],
        async () => {
          await execFileAsync("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], {
            cwd: workspace,
            maxBuffer: 4 * 1024 * 1024,
          });
        },
      );
      const bunVersion = (await execFileAsync("bun", ["--version"])).stdout.trim();
      const fixtureLock = await readFile(join(workspace, "bun.lock"));
      const verify = tracedVerify(context, realVerifyChild(artifacts));
      const upgrade = tracedUpgrade(context, realUpgradeChild(artifacts));
      const remediation = tracedRemediation(
        context,
        useExternalModel && process.env.OPENROUTER_API_KEY
          ? modelRemediationChild({
              artifactRoot: artifacts,
              configRoot: resolve(frozenRoot, "config"),
              apiKey: process.env.OPENROUTER_API_KEY,
              modelId: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
              systemPrompt: systemPrompt
                ? `${systemPrompt}\nEmit exactly one replace_adapter tool call. Do not use markdown fences.`
                : undefined,
              promptVersion: prompt.immutableId,
              observer: openInferenceModelObserver(),
            })
          : proposalRemediationChild(
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
        bunVersion,
      });
      accepted = parent.terminalVerdict === "accept";
      const evaluatorId = context.components.find(
        (component) => component.name === "independent-verifier",
      )!.immutableId;
      const evaluations = parent.childReceipts
        .filter((receipt) => receipt.kind === "verify")
        .map((receipt) => ({
          name: "goal-system.verification",
          evaluatorId,
          subjectId: receipt.id,
          label: receipt.verdict,
          score: receipt.verdict === "pass" ? 1 : 0,
          explanation:
            parent.transitions.find(
              (transition) => transition.childReceiptId === receipt.id,
            )?.phase ?? "verify",
        }));
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
        evaluations,
        artifacts: parent.artifacts,
      };
    } finally {
      if (!accepted && process.env.KEEP_WORKSPACE !== "1") {
        await rm(runRoot, { recursive: true, force: true });
      }
    }
    },
  );
}
