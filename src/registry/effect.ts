import { Context, Data, Effect, Either, Layer, Schedule } from "effect";
import { trace } from "@arizeai/phoenix-otel";
import type { SpanContext } from "@opentelemetry/api";
import * as EffectOtelResource from "@effect/opentelemetry/Resource";
import * as EffectOtelTracer from "@effect/opentelemetry/Tracer";

export class ExternalCallError extends Data.TaggedError("ExternalCallError")<{
  operation: string;
  cause: unknown;
}> {}

export class ExternalCallTimeout extends Data.TaggedError(
  "ExternalCallTimeout",
)<{
  operation: string;
  timeoutMs: number;
}> {}

export type ExternalCallFailure = ExternalCallError | ExternalCallTimeout;

export type ExternalCallInput<A> = {
  operation: string;
  run(signal: AbortSignal): Promise<A>;
  timeoutMs?: number;
  retries?: number;
  parentSpanContext?: SpanContext;
};

type ExternalCallService = {
  execute<A>(
    input: ExternalCallInput<A>,
  ): Effect.Effect<A, ExternalCallFailure>;
};

export class ExternalCalls extends Context.Tag("goal-system/ExternalCalls")<
  ExternalCalls,
  ExternalCallService
>() {}

export const ExternalCallsLive = Layer.succeed(ExternalCalls, {
  execute<A>(input: ExternalCallInput<A>) {
    let effect: Effect.Effect<A, ExternalCallFailure> = Effect.tryPromise({
      try: (signal) => input.run(signal),
      catch: (cause) =>
        new ExternalCallError({ operation: input.operation, cause }),
    });
    if (input.timeoutMs !== undefined) {
      effect = effect.pipe(
        Effect.timeoutFail({
          duration: input.timeoutMs,
          onTimeout: () =>
            new ExternalCallTimeout({
              operation: input.operation,
              timeoutMs: input.timeoutMs!,
            }),
        }),
      );
    }
    if ((input.retries ?? 0) > 0) {
      const policy = Schedule.exponential("100 millis").pipe(
        Schedule.intersect(Schedule.recurs(input.retries!)),
      );
      effect = effect.pipe(Effect.retry(policy));
    }
    return effect.pipe(
      Effect.withSpan(`external.${input.operation}`, {
        attributes: {
          "external.operation": input.operation,
          "external.retry.count": input.retries ?? 0,
        },
      }),
    );
  },
});

const EffectOtelLive = EffectOtelTracer.layerGlobal.pipe(
  Layer.provide(
    EffectOtelResource.layer({
      serviceName: "goal-system-external-calls",
    }),
  ),
);

export async function runExternal<A>(
  input: ExternalCallInput<A>,
): Promise<A> {
  let program = Effect.flatMap(ExternalCalls, (calls) =>
    calls.execute(input)).pipe(
    Effect.provide(ExternalCallsLive),
    Effect.provide(EffectOtelLive),
  );
  const parent =
    input.parentSpanContext ?? trace.getActiveSpan()?.spanContext();
  if (parent) {
    program = EffectOtelTracer.withSpanContext(program, parent);
  }
  const result = await Effect.runPromise(Effect.either(program));
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}
