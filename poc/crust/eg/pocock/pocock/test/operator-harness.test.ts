import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileRunStore } from "../../../../lib/store.js";
import { PocockOperator } from "../src/operator.js";
import { PocockWorkflow, type PocockRun } from "../src/workflow.js";

test("deterministic operator drives the same persisted grilling-to-specifying handoff", async () => {
  const run = PocockWorkflow.create({ id: "exercise", intent: "Exercise HITL", questions: [{ id: "authority", prompt: "Who advances?", required: true }], compositions: Object.fromEntries(["GRILLING", "SPECIFYING", "SLICING", "IMPLEMENTING", "REVIEWING"].map((phase) => [phase, { skill: phase, version: "sha256:test", source: `/skills/${phase}`, model: "test" }])) as PocockRun["compositions"] });
  const store = new FileRunStore<PocockRun>(join(await mkdtemp(join(tmpdir(), "pocock-")), "runs"));
  const workflow = new PocockWorkflow(run); await store.save(run);
  const candidate = workflow.proposeDecision({ questionId: "authority", decision: "Crust.", rationale: "Control stays external.", alternativesRejected: [] }); await store.save(run);
  const operator = new PocockOperator(workflow, store, "exercise-operator");
  await operator.approve(candidate.id);
  const receipt = await operator.advance();
  const resumed = new PocockWorkflow(await store.load(run.id));
  assert.equal(receipt.schema, "grilling-receipt/v1");
  assert.equal(resumed.state.phase, "SPECIFYING");
  assert.match(resumed.contextProjection(), /authority: Crust/);
  assert.doesNotMatch(resumed.contextProjection(), /alternativesRejected/);
});
