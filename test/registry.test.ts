import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compose,
  defaultProfile,
  exact,
  inMemoryTelemetry,
  local,
  Registry,
  workflow,
  type CompositionManifest,
  type Json,
  type Telemetry,
} from "../src/registry/index.js";
import { phoenixPrompt } from "../src/registry/phoenix.js";

test("Phoenix prompt can bind a remote name to a local composition slot", () => {
  const declaration = phoenixPrompt(
    "dependency-upgrade-remediator",
    {},
    "remediation-prompt",
  );
  assert.equal(declaration.name, "remediation-prompt");
  assert.deepEqual(declaration.selector, {
    type: "phoenix-prompt",
    name: "dependency-upgrade-remediator",
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "composition-registry-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/workflow.ts"), "export const version = 1;\n");
  const components = defaultProfile({
    workflow: [
      local("workflow", "src/workflow.ts", "goal-system.workflow/v1"),
    ],
    model: [exact("model", "model:test@1")],
  });
  const manifest: CompositionManifest = {
    schemaVersion: 1,
    name: "test-system",
    profile: "test/v1",
    components,
  };
  const registry = new Registry({
    rootDir: root,
    registryDir: join(root, "registry"),
  });
  return { root, registry, manifest };
}

test("identical immutable inputs resolve deterministically and persist", async () => {
  const { registry, manifest } = await fixture();
  const version = await registry.publish(manifest);
  const first = await registry.resolve(version);
  const second = await registry.resolve(version);
  assert.ok(!("kind" in first));
  assert.ok(!("kind" in second));
  assert.equal(first.compositionId, second.compositionId);
  assert.deepEqual(await registry.load(first.compositionId), first.lock);
});

test("changed governed component changes identity and old lock detects drift", async () => {
  const { root, registry, manifest } = await fixture();
  const version = await registry.publish(manifest);
  const first = await registry.resolve(version);
  assert.ok(!("kind" in first));
  await writeFile(join(root, "src/workflow.ts"), "export const version = 2;\n");
  await assert.rejects(registry.verify(first.lock), /component drift/);
  const second = await registry.resolve(version);
  assert.ok(!("kind" in second));
  assert.notEqual(first.compositionId, second.compositionId);
});

test("unknown references fail resolution without producing a lock", async () => {
  const { registry, manifest } = await fixture();
  manifest.components.workflow = [
    local("workflow", "src/missing.ts", "goal-system.workflow/v1"),
  ];
  const version = await registry.publish(manifest);
  const resolution = await registry.resolve(version);
  assert.ok("kind" in resolution);
  assert.equal(resolution.kind, "resolution_failure");
  assert.match(resolution.failures[0]!.message, /ENOENT/);
});

test("alias movement is explicit and compare-and-swap protected", async () => {
  const { registry, manifest } = await fixture();
  const first = await registry.publish(manifest);
  const second = await registry.publish({
    ...manifest,
    components: {
      ...manifest.components,
      model: [exact("model", "model:test@2")],
    },
  });
  await registry.promote("test-system@prod", first.id);
  const before = await registry.resolve("test-system@prod");
  assert.ok(!("kind" in before));
  await registry.promote("test-system@prod", second.id, first.id);
  const after = await registry.resolve("test-system@prod");
  assert.ok(!("kind" in after));
  assert.notEqual(before.compositionId, after.compositionId);
  await assert.rejects(
    registry.promote("test-system@prod", first.id, first.id),
    /expected/,
  );
});

test("compose hides lifecycle and correlates Receipt with trace", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-client-"));
  await writeFile(join(root, "workflow.ts"), "export {};\n");
  const seen: string[] = [];
  const telemetry: Telemetry = {
    run(input, execute) {
      seen.push(input.compositionId);
      return execute(
        "0123456789abcdef0123456789abcdef",
        async (_id, _components, run) => run(),
      );
    },
  };
  const system = await compose({
    name: "delightful-client",
    rootDir: root,
    registryDir: "registry",
    telemetry,
    workflow: workflow("workflow.ts", async (context, intent: Json) => {
      await context.transition("work", ["workflow"], async () => undefined);
      return { terminalVerdict: "accept", domain: intent };
    }),
  });
  const receipt = await system.run({ hello: "world" });
  assert.equal(receipt.compositionId, system.compositionId);
  assert.equal(receipt.traceId, "0123456789abcdef0123456789abcdef");
  assert.deepEqual(seen, [system.compositionId]);
  assert.equal(receipt.terminalVerdict, "accept");
  const persisted = JSON.parse(
    await readFile(
      join(root, "registry/locks", `${system.compositionId.slice(7)}.json`),
      "utf8",
    ),
  );
  assert.equal(persisted.manifestVersionId, system.manifestVersionId);
});

test("preflight drift produces a correlated reject Receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-drift-"));
  await writeFile(join(root, "workflow.ts"), "export const version = 1;\n");
  const system = await compose({
    name: "drift-receipt",
    rootDir: root,
    registryDir: "registry",
    telemetry: inMemoryTelemetry(),
    workflow: workflow("workflow.ts", async () => ({
      terminalVerdict: "accept",
      domain: { impossible: true },
    })),
  });
  await writeFile(join(root, "workflow.ts"), "export const version = 2;\n");
  const receipt = await system.run({});
  assert.equal(receipt.terminalVerdict, "reject");
  assert.match(
    (receipt.domain as unknown as { error: string }).error,
    /component drift/,
  );
  assert.equal(receipt.compositionId, system.compositionId);
  assert.equal(receipt.traceId.length, 32);
});

test("default profile makes every governed category explicit", () => {
  const profile = defaultProfile();
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
      "artifacts",
      "capabilities",
      "evaluators",
      "model",
      "policy",
      "prompts",
      "runtime",
      "schemas",
      "telemetry",
      "workflow",
    ],
  );
  assert.ok(Object.values(profile).every((entries) => entries.length === 1));
});
