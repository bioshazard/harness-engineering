import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALLOWED_DESTINATION,
  FORBIDDEN_DESTINATION,
  INPUT_CONTENT,
  invokeCapability,
  makeReceipt,
  SENTINEL_CONTENT,
  snapshotAuthority,
  SOURCE,
} from "../src/harness.js";

const PRINCIPAL = "learner@example.test";

async function fixture(principal: string | null = PRINCIPAL) {
  const root = await mkdtemp(join(tmpdir(), "hello-2-"));
  await mkdir(join(root, "sandbox"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, SOURCE), INPUT_CONTENT);
  await writeFile(join(root, FORBIDDEN_DESTINATION), SENTINEL_CONTENT);
  await writeFile(
    join(root, "CODEAUTH"),
    `grants:
  - principal: ${PRINCIPAL}
    capability: read_file
    resource: ${SOURCE}
  - principal: ${PRINCIPAL}
    capability: write_file
    resource: ${ALLOWED_DESTINATION}
`,
  );
  const gitconfig = join(root, "gitconfig");
  await writeFile(
    gitconfig,
    principal ? `[user]\n\temail = ${principal}\n` : "",
  );
  const authority = await snapshotAuthority(root, {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitconfig,
  });
  return { root, authority };
}

test("allowed copy evaluates success", async (t) => {
  const { root, authority } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const read = await invokeCapability(root, authority, "read_file", SOURCE);
  const write = await invokeCapability(
    root,
    authority,
    "write_file",
    ALLOWED_DESTINATION,
    read.observation,
  );
  const receipt = await makeReceipt(
    root,
    "allowed",
    authority.principal,
    [read, write],
  );
  assert.equal(receipt.verdict, "success");
  assert.equal(receipt.proposals[1]?.matchedGrant?.resource, ALLOWED_DESTINATION);
});

test("forbidden write preserves sentinel and evaluates failure", async (t) => {
  const { root, authority } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const read = await invokeCapability(root, authority, "read_file", SOURCE);
  const write = await invokeCapability(
    root,
    authority,
    "write_file",
    FORBIDDEN_DESTINATION,
    read.observation,
  );
  assert.equal(write.guard, "block");
  assert.equal(
    await readFile(join(root, FORBIDDEN_DESTINATION), "utf8"),
    SENTINEL_CONTENT,
  );
  const receipt = await makeReceipt(
    root,
    "forbidden",
    authority.principal,
    [read, write],
  );
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.observation.verdict, "match");
});

for (const [name, principal] of [
  ["missing", null],
  ["unknown", "unknown@example.test"],
] as const) {
  test(`${name} principal has no grants`, async (t) => {
    const { root, authority } = await fixture(principal);
    t.after(() => rm(root, { recursive: true, force: true }));
    const proposal = await invokeCapability(
      root,
      authority,
      "read_file",
      SOURCE,
    );
    assert.equal(proposal.guard, "block");
    assert.equal(proposal.denialReason, "no exact matching grant");
  });
}

for (const path of ["CODEAUTH", ".git/config"]) {
  test(`hard-denies ${path}`, async (t) => {
    const { root, authority } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const decision = await authority.authorize("read_file", path);
    assert.equal(decision.verdict, "block");
    if (decision.verdict === "block") {
      assert.equal(decision.reason, "hard-denied resource");
    }
  });
}

test("rejects symlink path components", async (t) => {
  const { root, authority } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "outside"));
  await writeFile(join(root, "outside", "input.txt"), INPUT_CONTENT);
  await symlink(join(root, "outside"), join(root, "sandbox", "link"));
  const decision = await authority.authorize(
    "read_file",
    "sandbox/link/input.txt",
  );
  assert.equal(decision.verdict, "block");
  if (decision.verdict === "block") {
    assert.equal(decision.reason, "symlink component");
  }
});

test("principal and policy are immutable snapshots", async (t) => {
  const { root, authority } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "CODEAUTH"), "grants: []\n");
  assert.equal(
    (await authority.authorize("read_file", SOURCE)).verdict,
    "allow",
  );
  assert.ok(Object.isFrozen(authority));
  assert.ok(Object.isFrozen(authority.grants));
});
