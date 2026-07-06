import {
  compose,
  exact,
  inMemoryTelemetry,
  local,
  phoenixPrompt,
  type Json,
} from "../../../src/registry/index.js";
import {
  dependencyUpgradeWorkflow,
  type UpgradeIntent,
} from "./workflow.js";

export async function dependencyUpgradeSystem(options: { live: boolean }) {
  return compose<UpgradeIntent, Json>({
    name: "dependency-upgrade-instrumented",
    workflow: dependencyUpgradeWorkflow,
    prompt:
      options.live && process.env.PHOENIX_PROMPT_NAME
        ? phoenixPrompt(process.env.PHOENIX_PROMPT_NAME)
        : local(
            "remediation-prompt",
            "poc/dependency-upgrade-instrumented/remediation-prompt.md",
            "goal-system.prompt/v1",
          ),
    profile: {
      model: [
        exact("remediation-model", "deterministic:known-valid-proposal@1"),
      ],
      capabilities: [
        exact("npm-capability", "npm:ci-and-install@10", {
          contract: "goal-system.capability/v1",
        }),
      ],
      policy: [
        local(
          "upgrade-policy",
          "poc/dependency-upgrade-instrumented/policy.md",
          "goal-system.policy/v1",
        ),
        exact("mutation-policy", "dependency-upgrade:adapter-only@1", {
          contract: "goal-system.policy/v1",
        }),
      ],
      evaluators: [
        exact("independent-verifier", "dependency-upgrade:tsc-and-tests@1", {
          contract: "goal-system.evaluator/v1",
        }),
      ],
      runtime: [
        exact("node-runtime", `node:${process.version}`, {
          contract: "goal-system.runtime/v1",
        }),
      ],
      schemas: [
        local(
          "receipt-schema",
          "poc/dependency-upgrade-instrumented/receipt.schema.json",
          "goal-system.schema/v1",
        ),
      ],
      telemetry: [
        exact("phoenix", "phoenix:otel-http@1", {
          contract: "goal-system.telemetry/v1",
        }),
      ],
    },
    ...(!options.live ? { telemetry: inMemoryTelemetry() } : {}),
  });
}
