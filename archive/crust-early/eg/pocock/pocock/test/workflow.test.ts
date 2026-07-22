import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PhaseArtifactStore } from "../src/artifact-store.js";
import { PocockWorkflow, type PocockRun } from "../src/workflow.js";

function run(): PocockRun {
  return PocockWorkflow.create({
    id: "pocock-1",
    intent: "Make the Pocock workflow durable.",
    questions: [{ id: "authority", prompt: "Who advances state?", required: true }],
    compositions: {
      GRILLING: lock("grill-me"),
      SPECIFYING: lock("to-spec"),
      SLICING: lock("to-tickets"),
      IMPLEMENTING: lock("implement"),
      REVIEWING: lock("code-review"),
    },
  });
}

function lock(skill: string) {
  return { skill, version: `sha256:${skill}`, source: `/skills/${skill}/SKILL.md`, model: "openai-codex/gpt-5.5" };
}

test("only accepted required decisions admit GRILLING to SPECIFYING", () => {
  const workflow = new PocockWorkflow(run());
  assert.throws(() => workflow.advance("operator-1"), /required decisions remain/);

  const decision = workflow.proposeDecision({
    questionId: "authority",
    decision: "Crust advances state.",
    rationale: "The child is not the control plane.",
    alternativesRejected: ["Let the child advance."],
  });
  workflow.approve(decision.id, "operator-1");
  const receipt = workflow.advance("operator-1");

  assert.equal(workflow.state.phase, "SPECIFYING");
  assert.equal(receipt.schema, "grilling-receipt/v1");
  if (receipt.schema === "grilling-receipt/v1") assert.deepEqual(receipt.acceptedDecisionIds, [decision.id]);
});

test("only an independently shape-validated spec admits SPECIFYING to SLICING", () => {
  const workflow = new PocockWorkflow(run());
  const decision = workflow.proposeDecision({ questionId: "authority", decision: "Crust advances state.", rationale: "Control.", alternativesRejected: [] });
  workflow.approve(decision.id, "operator-1");
  workflow.advance("operator-1");

  assert.throws(() => workflow.proposeSpec("spec.md", "# Draft"), /missing required headings/);
  const spec = workflow.proposeSpec("spec.md", validSpec());
  workflow.approve(spec.id, "operator-1");
  const receipt = workflow.advance("operator-1");

  assert.equal(workflow.state.phase, "SLICING");
  assert.equal(receipt.schema, "specifying-receipt/v1");
  if (receipt.schema === "specifying-receipt/v1") assert.equal(receipt.spec.reference, "spec.md");
});

test("phase artifact custody binds kind to phase and projects only its receipt", async () => {
  const workflow = new PocockWorkflow(run());
  const decision = workflow.proposeDecision({ questionId: "authority", decision: "Crust advances state.", rationale: "Control.", alternativesRejected: [] });
  workflow.approve(decision.id, "operator-1");
  workflow.advance("operator-1");
  const artifacts = new PhaseArtifactStore(join(await mkdtemp(join(tmpdir(), "pocock-artifacts-")), "runs", workflow.state.id), workflow);

  await assert.rejects(() => artifacts.stage("slices.json", "[]"), /only allowed in SLICING/);
  const receipt = await artifacts.stage("spec.md", "# Spec\n\nSensitive draft body");

  assert.equal(receipt.phase, "SPECIFYING");
  assert.equal(receipt.kind, "spec.md");
  assert.match(receipt.sha256, /^sha256:/);
  assert.match(receipt.path, /artifacts\/SPECIFYING\/spec-[a-f0-9-]+\.md$/);
  assert.equal(await readFile(receipt.path, "utf8"), "# Spec\n\nSensitive draft body");
  assert.match(workflow.contextProjection(), new RegExp(receipt.sha256));
  assert.doesNotMatch(workflow.contextProjection(), /Sensitive draft body/);

  const spec = workflow.proposeSpec("spec.md", validSpec());
  workflow.approve(spec.id, "operator-1");
  workflow.advance("operator-1");
  assert.match(workflow.contextProjection(), new RegExp(receipt.sha256));
  assert.doesNotMatch(workflow.contextProjection(), /Sensitive draft body/);
});

test("phase artifact custody rejects a symlinked run directory", async () => {
  const workflow = new PocockWorkflow(run());
  const decision = workflow.proposeDecision({ questionId: "authority", decision: "Crust advances state.", rationale: "Control.", alternativesRejected: [] });
  workflow.approve(decision.id, "operator-1");
  workflow.advance("operator-1");
  const root = await mkdtemp(join(tmpdir(), "pocock-artifact-link-"));
  const target = join(root, "target");
  const linkedRun = join(root, "linked-run");
  await mkdir(target);
  await symlink(target, linkedRun);

  await assert.rejects(() => new PhaseArtifactStore(linkedRun, workflow).stage("spec.md", "# Spec"), /real directory/);
});

test("slicing requires stable IDs and a ready frontier", () => {
  const workflow = toSlicing();
  assert.throws(() => workflow.proposeSlices([{ id: "", title: "Broken", blockedBy: [] }]), /stable ID/);
  assert.throws(() => workflow.proposeSlices([{ id: "blocked", title: "Blocked", blockedBy: ["missing"] }]), /unknown blocker/);
  assert.throws(() => workflow.proposeSlices([{ id: "a", title: "A", blockedBy: ["b"] }, { id: "b", title: "B", blockedBy: ["a"] }]), /acyclic/);

  const slices = workflow.proposeSlices([
    { id: "foundation", title: "Foundation", blockedBy: [] },
    { id: "feature", title: "Feature", blockedBy: ["foundation"] },
  ]);
  workflow.approve(slices.id, "operator-1");
  const receipt = workflow.advance("operator-1");

  assert.equal(receipt.schema, "slicing-receipt/v1");
  if (receipt.schema === "slicing-receipt/v1") assert.equal(receipt.readyTicketIds[0], "foundation");
  assert.equal(workflow.state.phase, "IMPLEMENTING");
  assert.equal(workflow.state.activeTicketId, "foundation");

});

test("review keeps standards and spec findings separate and returns findings to IMPLEMENTING", () => {
  const workflow = toImplementing();
  const implementation = workflow.proposeImplementation({ ticketId: "foundation", commit: "abc123", tests: ["bun test"], typecheck: "bun run typecheck" });
  workflow.approve(implementation.id, "operator-1");
  workflow.advance("operator-1");

  const review = workflow.proposeReview({ ticketId: "foundation", standardsFindings: ["Missing error path."], specFindings: [] });
  workflow.approve(review.id, "operator-1");
  const receipt = workflow.advance("operator-1");

  assert.equal(receipt.schema, "reviewing-receipt/v1");
  if (receipt.schema === "reviewing-receipt/v1") {
    assert.deepEqual(receipt.standardsFindings, ["Missing error path."]);
    assert.deepEqual(receipt.specFindings, []);
  }
  assert.equal(workflow.state.phase, "IMPLEMENTING");
  assert.equal(workflow.state.activeTicketId, "foundation");

  const retry = workflow.proposeImplementation({ ticketId: "foundation", commit: "def456", tests: ["bun test"], typecheck: "bun run typecheck" });
  workflow.approve(retry.id, "operator-1");
  workflow.advance("operator-1");
  const clean = workflow.proposeReview({ ticketId: "foundation", standardsFindings: [], specFindings: [] });
  workflow.approve(clean.id, "operator-1");
  workflow.advance("operator-1");
  assert.equal(workflow.state.phase, "DONE");
});

function validSpec(): string {
  return "## Problem Statement\n\nProblem\n\n## Solution\n\nSolution\n\n## User Stories\n\n1. Story\n\n## Implementation Decisions\n\nDecision\n\n## Testing Decisions\n\nTest\n\n## Out of Scope\n\nNone\n";
}

function toSlicing(): PocockWorkflow {
  const workflow = new PocockWorkflow(run());
  const decision = workflow.proposeDecision({ questionId: "authority", decision: "Crust advances state.", rationale: "Control.", alternativesRejected: [] });
  workflow.approve(decision.id, "operator-1");
  workflow.advance("operator-1");
  const spec = workflow.proposeSpec("spec.md", validSpec());
  workflow.approve(spec.id, "operator-1");
  workflow.advance("operator-1");
  return workflow;
}

function toImplementing(): PocockWorkflow {
  const workflow = toSlicing();
  const slices = workflow.proposeSlices([{ id: "foundation", title: "Foundation", blockedBy: [] }]);
  workflow.approve(slices.id, "operator-1");
  workflow.advance("operator-1");
  return workflow;
}
