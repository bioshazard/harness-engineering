import type {
  DraftExecutor,
  Identity,
  ReviewExecutor,
  ReviewVerdict,
} from "./types.js";

type OpenRouterResponse = {
  model?: string;
  choices?: { message?: { content?: string } }[];
};

function parseJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("model returned no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

async function complete(input: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter failed: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as OpenRouterResponse;
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(
      `OpenRouter returned no content: ${JSON.stringify(result).slice(0, 1_000)}`,
    );
  }
  return { value: parseJson(content), model: result.model ?? input.model };
}

export function modelDrafter(input: {
  apiKey: string;
  model: string;
}): DraftExecutor {
  const identity: Identity = { provider: "openrouter", model: input.model };
  return {
    identity,
    async draft({ thread, revisionFeedback }) {
      const result = await complete({
        ...input,
        system:
          'Draft a concise email reply. Return JSON only: {"body":"..."}. Do not add facts absent from the source.',
        prompt: JSON.stringify({
          source: {
            from: thread.from,
            subject: thread.subject,
            body: thread.body,
          },
          revisionFeedback,
        }),
      });
      identity.model = result.model;
      if (typeof result.value.body !== "string") {
        throw new Error("drafter response missing body");
      }
      return result.value.body;
    },
  };
}

export function modelReviewer(input: {
  apiKey: string;
  model: string;
}): ReviewExecutor {
  const identity: Identity = { provider: "openrouter", model: input.model };
  return {
    identity,
    async review({ thread, draft }) {
      const result = await complete({
        ...input,
        system:
          'Review reply accuracy, directness, and safety. Return JSON only: {"verdict":"approve|revise|reject|escalate","feedback":"..."}. Approve a concise reply that faithfully answers the source.',
        prompt: JSON.stringify({
          source: {
            from: thread.from,
            subject: thread.subject,
            body: thread.body,
          },
          draft: {
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
          },
        }),
      });
      identity.model = result.model;
      const verdicts: ReviewVerdict[] = [
        "approve",
        "revise",
        "reject",
        "escalate",
      ];
      if (
        typeof result.value.verdict !== "string" ||
        !verdicts.includes(result.value.verdict as ReviewVerdict) ||
        typeof result.value.feedback !== "string"
      ) {
        throw new Error("reviewer response has invalid shape");
      }
      return {
        verdict: result.value.verdict as ReviewVerdict,
        feedback: result.value.feedback,
      };
    },
  };
}
