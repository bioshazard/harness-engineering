import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileRunStore } from "../src/store.js";
import {
  GrillingWorkflow,
  type GrillingRun,
} from "../src/workflow.js";

function run(): GrillingRun {
  return {
    id: "run-1",
    workflowRevision: "pocock-grill-me/v1",
    state: "GRILLING",
    intent: "Design a durable agent workflow.",
    composition: {
      skill: "grill-me",
      version: "sha256:skill",
      source: "/skills/grill-me/SKILL.md",
      model: "openai-codex/gpt-5.4",
      contextId: "sha256:context",
    },
    questions: [
      { id: "authority", prompt: "Who advances workflow state?", required: true, status: "open" },
    ],
    decisions: [],
    approvals: [],
    artifacts: [],
    events: [],
  };
}

test("a child proposal is durable but cannot resolve a decision or finish GRILLING", () => {
  const workflow = new GrillingWorkflow(run());
  const candidate = workflow.proposeDecision({
    questionId: "authority",
    decision: "Crust advances workflow state.",
    rationale: "The worker must not own control flow.",
    alternativesRejected: ["Let the Pi child decide."],
  });

  assert.equal(candidate.status, "proposed");
  assert.equal(workflow.state.questions[0]?.status, "open");
  assert.throws(() => workflow.complete(), /required questions remain/);
});

test("operator approval accepts the decision and produces a Receipt only when required branches resolve", () => {
  const workflow = new GrillingWorkflow(run());
  const candidate = workflow.proposeDecision({
    questionId: "authority",
    decision: "Crust advances workflow state.",
    rationale: "Control outside the worker.",
    alternativesRejected: [],
  });

  workflow.confirmDecision(candidate.id, "operator-1", true);
  const receipt = workflow.complete();

  assert.equal(workflow.state.state, "COMPLETE");
  assert.deepEqual(receipt.acceptedDecisionIds, [candidate.id]);
  assert.equal(receipt.composition.version, "sha256:skill");
  assert.equal(receipt.terminalVerdict, "complete");
});

test("rejection keeps the branch open and records the operator verdict", () => {
  const workflow = new GrillingWorkflow(run());
  const candidate = workflow.proposeDecision({
    questionId: "authority",
    decision: "The Pi child advances workflow state.",
    rationale: "It has the conversation.",
    alternativesRejected: [],
  });

  workflow.confirmDecision(candidate.id, "operator-1", false, "The state machine owns progression.");

  assert.equal(workflow.state.questions[0]?.status, "open");
  assert.equal(workflow.state.decisions[0]?.status, "rejected");
  assert.equal(workflow.state.approvals[0]?.reason, "The state machine owns progression.");
});

test("only one candidate can resolve a question", () => {
  const workflow = new GrillingWorkflow(run());
  const first = workflow.proposeDecision({
    questionId: "authority",
    decision: "Crust advances workflow state.",
    rationale: "Control is external.",
    alternativesRejected: [],
  });
  const second = workflow.proposeDecision({
    questionId: "authority",
    decision: "The child advances state.",
    rationale: "The child holds the conversation.",
    alternativesRejected: [],
  });

  workflow.confirmDecision(first.id, "operator-1", true);

  assert.throws(() => workflow.confirmDecision(second.id, "operator-1", true), /already resolved/);
});

test("the accepted decision ledger survives a fresh workflow instance", async () => {
  const workflow = new GrillingWorkflow(run());
  const candidate = workflow.proposeDecision({
    questionId: "authority",
    decision: "Crust advances workflow state.",
    rationale: "Control belongs outside the worker.",
    alternativesRejected: [],
  });
  workflow.confirmDecision(candidate.id, "operator-1", true);
  workflow.complete();

  const store = new FileRunStore<GrillingRun>(join(await mkdtemp(join(tmpdir(), "crust-")), "runs"));
  await store.save(workflow.state);
  const resumed = new GrillingWorkflow(await store.load(workflow.state.id));

  assert.equal(resumed.state.state, "COMPLETE");
  assert.equal(resumed.state.receipt?.acceptedDecisionIds[0], candidate.id);
});
