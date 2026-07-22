import {
  ADAPTER_PATH,
  LOCKFILE_PATH,
  MANIFEST_PATH,
  TARGET_DEPENDENCY,
  type AuthorityDecision,
  type ChildReceipt,
  type ParentReceipt,
  type RemediateChild,
  type Transition,
  type UpgradeChild,
  type VerifyChild,
} from "./contracts.js";
import { changedFiles, snapshot } from "./workspace.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ALLOWED = [MANIFEST_PATH, LOCKFILE_PATH, ADAPTER_PATH].sort();
const DIAGNOSTIC_BUDGET = 16_384;

export async function runMesoHarness(input: {
  workspace: string;
  fixtureIdentity: string;
  verify: VerifyChild;
  upgrade: UpgradeChild;
  remediate: RemediateChild;
  bunVersion: string;
}): Promise<ParentReceipt> {
  const initial = await snapshot(input.workspace);
  const childReceipts: ChildReceipt[] = [];
  const transitions: Transition[] = [];
  const authorityDecisions: AuthorityDecision[] = [];
  let reason = "";

  const baseline = await input.verify.run({
    workspace: input.workspace,
    label: "baseline",
  });
  childReceipts.push(baseline);
  if (baseline.verdict === "fail") {
    transitions.push({
      phase: "verify_baseline",
      childReceiptId: baseline.id,
      observation: "baseline failed",
      reaction: "reject",
    });
    reason = "baseline verification failed";
    return finish("reject");
  }
  transitions.push({
    phase: "verify_baseline",
    childReceiptId: baseline.id,
    observation: "baseline passed",
    reaction: "upgrade",
  });

  const upgrade = await input.upgrade.run({ workspace: input.workspace });
  childReceipts.push(upgrade);
  const upgradeContained =
    upgrade.verdict === "pass" &&
    upgrade.after === TARGET_DEPENDENCY &&
    upgrade.changedFiles.every((file) =>
      [MANIFEST_PATH, LOCKFILE_PATH].includes(file),
    ) &&
    upgrade.dependencyDelta.installScriptsAdded === 0;
  if (!upgradeContained) {
    transitions.push({
      phase: "upgrade",
      childReceiptId: upgrade.id,
      observation: "upgrade escaped deterministic policy",
      reaction: "reject",
    });
    reason = "upgrade was not exact, contained, and script-free";
    return finish("reject");
  }
  transitions.push({
    phase: "upgrade",
    childReceiptId: upgrade.id,
    observation: `exact ${upgrade.after}; contained`,
    reaction: "verify_candidate",
  });

  const candidate = await input.verify.run({
    workspace: input.workspace,
    label: "candidate",
  });
  childReceipts.push(candidate);
  if (candidate.verdict === "pass") {
    transitions.push({
      phase: "verify_candidate",
      childReceiptId: candidate.id,
      observation: "candidate passed without remediation",
      reaction: "accept",
    });
    reason = "exact candidate passed independently";
    return finish("accept");
  }

  const diagnosticsSerialized = JSON.stringify(candidate.diagnostics);
  const localized =
    candidate.typecheck === "fail" &&
    candidate.diagnostics.length > 0 &&
    candidate.diagnostics.every(
      (diagnostic) => diagnostic.file === ADAPTER_PATH,
    ) &&
    Buffer.byteLength(diagnosticsSerialized) <= DIAGNOSTIC_BUDGET;
  if (!localized) {
    transitions.push({
      phase: "verify_candidate",
      childReceiptId: candidate.id,
      observation: "failure not eligible for bounded adapter remediation",
      reaction: "reject",
    });
    reason = "candidate failure was not localized to adapter";
    return finish("reject");
  }
  transitions.push({
    phase: "verify_candidate",
    childReceiptId: candidate.id,
    observation: "all diagnostics localized to adapter",
    reaction: "authorize_remediation",
  });

  const remediation = await input.remediate.run({
    workspace: input.workspace,
    intent:
      "Restore typecheck for minimatch@9.0.9 by replacing only the dependency adapter; preserve its interface.",
    diagnostics: candidate.diagnostics,
  });
  childReceipts.push(remediation);
  authorityDecisions.push(remediation.authority);
  if (
    remediation.verdict === "fail" ||
    remediation.authority.verdict === "block" ||
    remediation.effect !== "replaced"
  ) {
    transitions.push({
      phase: "authorize_remediation",
      childReceiptId: remediation.id,
      observation:
        remediation.authority.verdict === "block"
          ? `proposal blocked: ${remediation.authority.reason}`
          : "remediation produced no authorized effect",
      reaction: "reject",
    });
    reason = "adapter remediation blocked or failed";
    return finish("reject");
  }
  transitions.push({
    phase: "authorize_remediation",
    childReceiptId: remediation.id,
    observation: "one adapter replacement authorized",
    reaction: "reverify",
  });

  const reverify = await input.verify.run({
    workspace: input.workspace,
    label: "reverify",
  });
  childReceipts.push(reverify);
  if (reverify.verdict === "pass") {
    transitions.push({
      phase: "reverify",
      childReceiptId: reverify.id,
      observation: "remediated candidate passed",
      reaction: "accept",
    });
    reason = "bounded adapter remediation passed independent verification";
    return finish("accept");
  }
  transitions.push({
    phase: "reverify",
    childReceiptId: reverify.id,
    observation: "remediated candidate failed",
    reaction: "reject",
  });
  reason = "bounded remediation was ineffective";
  return finish("reject");

  async function finish(
    requested: "accept" | "reject",
  ): Promise<ParentReceipt> {
    const changed = changedFiles(initial, await snapshot(input.workspace));
    const withinAllowed = changed.every((file) => ALLOWED.includes(file));
    let declaredDependency: string | null = null;
    let installedDependency: string | null = null;
    try {
      const manifest = JSON.parse(
        await readFile(join(input.workspace, MANIFEST_PATH), "utf8"),
      ) as { dependencies?: Record<string, string> };
      declaredDependency = manifest.dependencies?.minimatch ?? null;
      const installed = JSON.parse(
        await readFile(
          join(input.workspace, "node_modules/minimatch/package.json"),
          "utf8",
        ),
      ) as { name?: string; version?: string };
      installedDependency =
        installed.name && installed.version
          ? `${installed.name}@${installed.version}`
          : null;
    } catch {
      // Missing or malformed terminal State fails acceptance below.
    }
    const exactDependency =
      declaredDependency === "9.0.9" &&
      installedDependency === TARGET_DEPENDENCY;
    const exactFiles =
      requested === "accept" &&
      [MANIFEST_PATH, LOCKFILE_PATH].every((file) => changed.includes(file)) &&
      withinAllowed &&
      exactDependency;
    const terminalVerdict =
      requested === "accept" && exactFiles ? "accept" : "reject";
    if (requested === "accept" && !exactFiles) {
      reason =
        "terminal dependency identity or independent workspace diff violated acceptance policy";
    }
    const artifacts = childReceipts.flatMap((receipt) => receipt.artifacts);
    const remediation = childReceipts.find(
      (receipt) => receipt.kind === "remediate",
    );
    return {
      intent: {
        dependency: TARGET_DEPENDENCY,
        fixture: input.fixtureIdentity,
        allowedMutations: ALLOWED,
      },
      transitions,
      childReceipts,
      authorityDecisions,
      terminalVerdict,
      reason,
      changedFiles: changed,
      terminalObservation: {
        declaredDependency,
        installedDependency,
        changedFiles: changed,
        withinAllowedMutations: withinAllowed,
      },
      artifacts,
      ...(remediation?.kind === "remediate"
        ? { executor: remediation.executor }
        : {}),
      runtime: { bun: input.bunVersion },
    };
  }
}
