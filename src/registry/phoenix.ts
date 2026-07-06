import { createClient } from "@arizeai/phoenix-client";
import { getPrompt } from "@arizeai/phoenix-client/prompts";
import { addTraceAnnotation } from "@arizeai/phoenix-client/traces";
import {
  register,
  SpanStatusCode,
  trace,
  type NodeTracerProvider,
} from "@arizeai/phoenix-otel";
import type { SpanContext } from "@opentelemetry/api";
import type {
  ComponentDeclaration,
  ResolvedComponent,
  Telemetry,
  Transition,
} from "./types.js";
import { digest } from "./canonical.js";
import { runExternal } from "./effect.js";

export function phoenixPrompt(
  name: string,
  selector: { tag?: string; versionId?: string } = {},
  localName = name,
): ComponentDeclaration {
  return {
    name: localName,
    provider: "phoenix",
    contract: "phoenix.prompt/v1",
    selector: { type: "phoenix-prompt", name, ...selector },
  };
}

export function phoenixClient(endpoint: string, apiKey: string) {
  return createClient({
    options: {
      baseUrl: endpoint,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });
}

export async function resolvePhoenixPrompt(
  declaration: ComponentDeclaration,
  endpoint: string,
  apiKey: string,
): Promise<Omit<ResolvedComponent, "category">> {
  if (declaration.selector.type !== "phoenix-prompt") {
    throw new Error("not a Phoenix prompt selector");
  }
  const selector = declaration.selector;
  const prompt = await getPrompt({
    client: phoenixClient(endpoint, apiKey),
    prompt: selector.versionId
      ? { versionId: selector.versionId }
      : selector.tag
        ? { name: selector.name, tag: selector.tag }
        : { name: selector.name },
  });
  if (!prompt) throw new Error(`Phoenix prompt not found: ${selector.name}`);
  return {
    name: declaration.name,
    provider: declaration.provider,
    contract: declaration.contract,
    immutableId: `phoenix-prompt-version:${prompt.id}`,
    digest: digest(prompt as never),
    source: {
      endpoint,
      name: selector.name,
      versionId: prompt.id,
      modelName: prompt.model_name,
      template: prompt.template as never,
    },
  };
}

export function phoenixTelemetry(input: {
  endpoint: string;
  apiKey: string;
  project?: string;
}): Telemetry {
  let provider: NodeTracerProvider | undefined;
  return {
    async run(runInput, execute) {
      provider ??= register({
        projectName: input.project ?? "default",
        url: input.endpoint,
        apiKey: input.apiKey,
        batch: false,
      });
      const tracer = trace.getTracer("goal-system-composition");
      let traceId = "";
      let rootSpanContext: SpanContext | undefined;
      const result = await tracer.startActiveSpan("goal-system.run", async (root) => {
        traceId = root.spanContext().traceId;
        rootSpanContext = root.spanContext();
        root.setAttributes({
          "goal.run.id": runInput.runId,
          "goal.composition.id": runInput.compositionId,
          "goal.manifest.version.id": runInput.manifestVersionId,
        });
        for (const component of runInput.components) {
          root.setAttribute(
            `goal.component.${component.name}.id`,
            component.immutableId,
          );
        }
        const transition: Transition = async (
          transitionId,
          componentNames,
          run,
        ) =>
          tracer.startActiveSpan(`goal.transition.${transitionId}`, async (span) => {
            span.setAttributes({
              "goal.run.id": runInput.runId,
              "goal.composition.id": runInput.compositionId,
              "goal.transition.id": transitionId,
            });
            for (const name of componentNames) {
              const component = runInput.components.find(
                (candidate) => candidate.name === name,
              );
              if (component) {
                span.setAttribute(
                  `goal.component.${name}.id`,
                  component.immutableId,
                );
              }
            }
            try {
              const result = await run();
              span.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (error) {
              span.recordException(error as Error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
              });
              throw error;
            } finally {
              span.end();
            }
          });
        try {
          const result = await execute(
            traceId,
            transition,
            (attributes) => trace.getActiveSpan()?.setAttributes(attributes),
            (name, attributes) =>
              trace.getActiveSpan()?.addEvent(name, attributes),
          );
          root.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          root.recordException(error as Error);
          root.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          root.end();
          await provider!.forceFlush();
        }
      });
      await publishPhoenixEvaluations(
        phoenixClient(input.endpoint, input.apiKey),
        traceId,
        result,
        rootSpanContext,
      );
      return result;
    },
  };
}

export async function publishPhoenixEvaluations(
  client: ReturnType<typeof phoenixClient>,
  traceId: string,
  value: unknown,
  parentSpanContext?: SpanContext,
): Promise<void> {
  if (!value || typeof value !== "object") return;
  const receipt = value as {
    id?: string;
    compositionId?: string;
    evaluations?: Array<{
      name: string;
      evaluatorId: string;
      subjectId: string;
      label: string;
      score?: number;
      explanation?: string;
    }>;
  };
  if (!receipt.id || !receipt.evaluations?.length) return;
  await Promise.all(
    receipt.evaluations.map((evaluation) =>
      runExternal({
        operation: "phoenix-annotation",
        timeoutMs: 5_000,
        retries: 2,
        parentSpanContext,
        run: () =>
          addTraceAnnotation({
            client,
            sync: true,
            traceAnnotation: {
              traceId,
              name: evaluation.name,
              label: evaluation.label,
              score: evaluation.score,
              explanation: evaluation.explanation,
              annotatorKind: "CODE",
              identifier: `${receipt.id}:${evaluation.subjectId}`,
              metadata: {
                receiptId: receipt.id,
                compositionId: receipt.compositionId,
                evaluatorId: evaluation.evaluatorId,
                subjectId: evaluation.subjectId,
                authority: "observation-only",
              },
            },
          }),
      }),
    ),
  );
}
