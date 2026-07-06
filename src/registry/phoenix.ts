import { createClient } from "@arizeai/phoenix-client";
import { getPrompt } from "@arizeai/phoenix-client/prompts";
import {
  register,
  SpanStatusCode,
  trace,
  type NodeTracerProvider,
} from "@arizeai/phoenix-otel";
import type {
  ComponentDeclaration,
  ResolvedComponent,
  Telemetry,
  Transition,
} from "./types.js";
import { digest } from "./canonical.js";

export function phoenixPrompt(
  name: string,
  selector: { tag?: string; versionId?: string } = {},
): ComponentDeclaration {
  return {
    name,
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
      return tracer.startActiveSpan("goal-system.run", async (root) => {
        const traceId = root.spanContext().traceId;
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
              return await run();
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
          const result = await execute(traceId, transition);
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
    },
  };
}
