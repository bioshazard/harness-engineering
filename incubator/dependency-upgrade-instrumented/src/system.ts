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
import { DEFAULT_OPENROUTER_MODEL } from "./config.js";

export async function dependencyUpgradeSystem(options: {
  live: boolean;
  allowExternalModel?: boolean;
}) {
  return compose<UpgradeIntent, Json>({
    name: "dependency-upgrade-instrumented",
    workflow: dependencyUpgradeWorkflow(options.allowExternalModel),
    prompt:
      options.live && process.env.PHOENIX_PROMPT_NAME
        ? phoenixPrompt(
            process.env.PHOENIX_PROMPT_NAME,
            {},
            "remediation-prompt",
          )
        : local(
            "remediation-prompt",
            "incubator/dependency-upgrade-instrumented/remediation-prompt.md",
            "goal-system.prompt/v1",
          ),
    profile: {
      model: [
        exact(
          "remediation-model",
          options.allowExternalModel
            ? `openrouter:${process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL}`
            : "deterministic:known-valid-proposal@1",
        ),
      ],
      capabilities: [
        exact("bun-capability", "bun:install-and-add@1.2", {
          contract: "goal-system.capability/v1",
        }),
      ],
      policy: [
        local(
          "upgrade-policy",
          "incubator/dependency-upgrade-instrumented/policy.md",
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
        exact("bun-runtime", `bun:${(process.versions as { bun?: string }).bun ?? "unknown"}`, {
          contract: "goal-system.runtime/v1",
        }),
      ],
      schemas: [
        local(
          "receipt-schema",
          "incubator/dependency-upgrade-instrumented/receipt.schema.json",
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
