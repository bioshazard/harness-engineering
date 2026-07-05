import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ADAPTER_PATH,
  type UpgradeChild,
  type VerifyChild,
  type VerifyReceipt,
} from "../src/contracts.js";
import { receiptId } from "../src/evidence.js";
import { runMesoHarness } from "../src/parent.js";
import {
  authorizeAndReplace,
  proposalRemediationChild,
} from "../src/remediation.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meso-test-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "minimatch"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ dependencies: { minimatch: "3.1.2" } })}\n`,
  );
  await writeFile(
    join(root, "package-lock.json"),
    `${JSON.stringify({ lockfileVersion: 3, packages: {} })}\n`,
  );
  await writeFile(
    join(root, ADAPTER_PATH),
    'import minimatch from "minimatch";\nexport const match = minimatch;\n',
  );
  await writeFile(
    join(root, "node_modules", "minimatch", "package.json"),
    `${JSON.stringify({ name: "minimatch", version: "3.1.2" })}\n`,
  );
  return root;
}

function verifyReceipt(
  verdict: "pass" | "fail",
  label: string,
): VerifyReceipt {
  const partial = {
    kind: "verify" as const,
    verdict,
    typecheck: verdict,
    tests: "pass" as const,
    diagnostics:
      verdict === "fail"
        ? [
            {
              file: ADAPTER_PATH,
              code: "TS2613",
              message: "Module has no default export.",
            },
          ]
        : [],
    artifacts: [],
  };
  return { ...partial, id: `${label}-${receiptId(partial)}` };
}

function sequencedVerify(verdicts: ("pass" | "fail")[]): VerifyChild {
  let index = 0;
  return {
    async run({ label }) {
      return verifyReceipt(verdicts[index++] ?? "fail", label);
    },
  };
}

function exactUpgrade(): UpgradeChild {
  return {
    async run({ workspace }) {
      await writeFile(
        join(workspace, "package.json"),
        `${JSON.stringify({ dependencies: { minimatch: "9.0.9" } })}\n`,
      );
      await writeFile(
        join(workspace, "package-lock.json"),
        `${JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/minimatch": { version: "9.0.9" } } })}\n`,
      );
      await writeFile(
        join(workspace, "node_modules", "minimatch", "package.json"),
        `${JSON.stringify({ name: "minimatch", version: "9.0.9" })}\n`,
      );
      const partial = {
        kind: "upgrade" as const,
        verdict: "pass" as const,
        before: "minimatch@3.1.2",
        after: "minimatch@9.0.9",
        changedFiles: ["package-lock.json", "package.json"],
        dependencyDelta: {
          added: 0,
          removed: 3,
          installScriptsAdded: 0,
        },
        artifacts: [],
      };
      return { ...partial, id: receiptId(partial) };
    },
  };
}

test("child failure steers to one valid adapter remediation and acceptance", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const receipt = await runMesoHarness({
    workspace,
    fixtureIdentity: "deterministic",
    verify: sequencedVerify(["pass", "fail", "pass"]),
    upgrade: exactUpgrade(),
    remediate: proposalRemediationChild(
      {
        path: ADAPTER_PATH,
        content:
          'import { minimatch } from "minimatch";\nexport const match = minimatch;\n',
      },
      join(workspace, ".artifacts"),
    ),
  });
  assert.equal(receipt.terminalVerdict, "accept");
  assert.deepEqual(
    receipt.transitions.map((transition) => transition.reaction),
    ["upgrade", "verify_candidate", "authorize_remediation", "reverify", "accept"],
  );
  assert.equal(receipt.authorityDecisions[0]?.verdict, "allow");
  assert.deepEqual(receipt.changedFiles, [
    "package-lock.json",
    "package.json",
    ADAPTER_PATH,
  ]);
  assert.equal(
    receipt.terminalObservation.installedDependency,
    "minimatch@9.0.9",
  );
});

test("protected-file Proposal is blocked and rejected", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const original = await readFile(join(workspace, "package.json"), "utf8");
  const receipt = await runMesoHarness({
    workspace,
    fixtureIdentity: "deterministic",
    verify: sequencedVerify(["pass", "fail"]),
    upgrade: exactUpgrade(),
    remediate: proposalRemediationChild(
      { path: "package.json", content: "{}\n" },
      join(workspace, ".artifacts"),
    ),
  });
  assert.equal(receipt.terminalVerdict, "reject");
  assert.equal(receipt.authorityDecisions[0]?.verdict, "block");
  assert.notEqual(await readFile(join(workspace, "package.json"), "utf8"), original);
});

test("allowed but ineffective remediation reverifies then rejects", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const content = await readFile(join(workspace, ADAPTER_PATH), "utf8");
  const receipt = await runMesoHarness({
    workspace,
    fixtureIdentity: "deterministic",
    verify: sequencedVerify(["pass", "fail", "fail"]),
    upgrade: exactUpgrade(),
    remediate: proposalRemediationChild(
      { path: ADAPTER_PATH, content },
      join(workspace, ".artifacts"),
    ),
  });
  assert.equal(receipt.terminalVerdict, "reject");
  assert.equal(receipt.transitions.at(-1)?.phase, "reverify");
  assert.equal(receipt.childReceipts.filter((child) => child.kind === "remediate").length, 1);
});

test("replacement guard rejects a symlink adapter", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const adapter = join(workspace, ADAPTER_PATH);
  const target = join(workspace, "outside.ts");
  await rm(adapter);
  await writeFile(target, "sentinel\n");
  await symlink(target, adapter);
  const result = await authorizeAndReplace(workspace, {
    path: ADAPTER_PATH,
    content: "replacement\n",
  });
  assert.equal(result.authority.verdict, "block");
  assert.equal(await readFile(target, "utf8"), "sentinel\n");
});

test("independent final diff rejects a child receipt that hides protected mutation", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(join(workspace, "src", "consumer.ts"), "protected\n");
  const dishonestUpgrade = exactUpgrade();
  const originalRun = dishonestUpgrade.run;
  dishonestUpgrade.run = async (input) => {
    const receipt = await originalRun(input);
    await writeFile(join(input.workspace, "src", "consumer.ts"), "mutated\n");
    return receipt;
  };
  const receipt = await runMesoHarness({
    workspace,
    fixtureIdentity: "deterministic",
    verify: sequencedVerify(["pass", "pass"]),
    upgrade: dishonestUpgrade,
    remediate: proposalRemediationChild(
      { path: ADAPTER_PATH, content: "unused\n" },
      join(workspace, ".artifacts"),
    ),
  });
  assert.equal(receipt.terminalVerdict, "reject");
  assert.match(receipt.reason, /workspace diff/);
  assert.ok(receipt.changedFiles.includes("src/consumer.ts"));
});

test("Receipt identity ignores artifact location but binds its hash", () => {
  const base = {
    kind: "verify",
    verdict: "pass",
    artifacts: [{ name: "typecheck.txt", path: "/tmp/a", sha256: "abc" }],
  };
  assert.equal(
    receiptId(base),
    receiptId({
      ...base,
      artifacts: [{ ...base.artifacts[0]!, path: "/different-machine/b" }],
    }),
  );
  assert.notEqual(
    receiptId(base),
    receiptId({
      ...base,
      artifacts: [{ ...base.artifacts[0]!, sha256: "changed" }],
    }),
  );
  assert.notEqual(
    receiptId({ proposal: { path: "adapter.ts", content: "same" } }),
    receiptId({ proposal: { path: "package.json", content: "same" } }),
  );
});

test("terminal Observation rejects a lying installed dependency identity", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const upgrade = exactUpgrade();
  const originalRun = upgrade.run;
  upgrade.run = async (input) => {
    const receipt = await originalRun(input);
    await writeFile(
      join(input.workspace, "node_modules", "minimatch", "package.json"),
      `${JSON.stringify({ name: "minimatch", version: "9.0.8" })}\n`,
    );
    return receipt;
  };
  const receipt = await runMesoHarness({
    workspace,
    fixtureIdentity: "deterministic",
    verify: sequencedVerify(["pass", "pass"]),
    upgrade,
    remediate: proposalRemediationChild(
      { path: ADAPTER_PATH, content: "unused\n" },
      join(workspace, ".artifacts"),
    ),
  });
  assert.equal(receipt.terminalVerdict, "reject");
  assert.equal(
    receipt.terminalObservation.installedDependency,
    "minimatch@9.0.8",
  );
});
