import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  EXPECTED_CONTENT,
  TARGET_PATH,
  allowedTarget,
  executeWrite,
  guardProposal,
  makeReceipt,
} from "../src/harness.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "hello-1-"));
  await mkdir(dirname(allowedTarget(cwd)), { recursive: true });
  return cwd;
}

test("allowed write evaluates success", async (t) => {
  const cwd = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const proposal = {
    path: TARGET_PATH,
    content: EXPECTED_CONTENT,
  };
  const guard = guardProposal(cwd, proposal);
  assert.equal(guard.verdict, "allow");
  await executeWrite(cwd, proposal);
  const receipt = await makeReceipt(cwd, {
    proposal,
    guard,
    tool: { verdict: "written" },
  });
  assert.equal(receipt.verdict, "success");
  assert.equal(receipt.readback.verdict, "match");
});

test("disallowed path is blocked before write", async (t) => {
  const cwd = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const proposal = {
    path: join(cwd, "elsewhere.txt"),
    content: EXPECTED_CONTENT,
  };
  const guard = guardProposal(cwd, proposal);
  assert.equal(guard.verdict, "block");
  const receipt = await makeReceipt(cwd, {
    proposal,
    guard,
    tool: { verdict: "not_run" },
  });
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.readback.verdict, "not_observed");
});

test("wrong content writes then evaluates failure", async (t) => {
  const cwd = await fixture();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const proposal = {
    path: allowedTarget(cwd),
    content: "wrong",
  };
  const guard = guardProposal(cwd, proposal);
  assert.equal(guard.verdict, "allow");
  await executeWrite(cwd, proposal);
  const receipt = await makeReceipt(cwd, {
    proposal,
    guard,
    tool: { verdict: "written" },
  });
  assert.equal(receipt.verdict, "failure");
  assert.equal(receipt.readback.verdict, "mismatch");
});

test("canonical target remains intentionally fixed", () => {
  assert.equal(TARGET_PATH, "./sandbox/hello.txt");
});
