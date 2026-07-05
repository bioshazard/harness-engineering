import { draftMcp, MockEmailProvider, sendMcp } from "./mcp.js";
import { modelDrafter, modelReviewer } from "./model.js";
import { runEmailMeso } from "./parent.js";

async function main() {
  if (!process.argv.includes("--allow-external-model")) {
    throw new Error(
      "integration requires --allow-external-model because mock email content is sent to OpenRouter",
    );
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  const model = process.env.OPENROUTER_MODEL ?? "openrouter/free";
  const provider = new MockEmailProvider({
    messages: [
      {
        id: "message-1",
        threadId: "thread-1",
        from: "alice@example.test",
        to: ["learner@example.test"],
        subject: "Launch date confirmation",
        body: "Please reply confirming that the launch date is Tuesday.",
        labels: ["inbox"],
      },
      {
        id: "protected",
        threadId: "protected-thread",
        from: "private@example.test",
        to: ["learner@example.test"],
        subject: "Private",
        body: "This unrelated content must never enter model Context.",
        labels: ["inbox"],
      },
    ],
    drafts: [],
    sent: [],
  });
  const drafter = modelDrafter({ apiKey, model });
  const reviewer = modelReviewer({ apiKey, model });
  const receipt = await runEmailMeso({
    threadId: "thread-1",
    draftMcp: draftMcp(provider),
    sendMcp: sendMcp(provider),
    observation: provider,
    drafter,
    reviewer,
    reviewPolicy: {
      id: "email-reply-review-v1",
      criteria: [
        "faithful to source",
        "directly answers request",
        "contains no unsupported facts",
        "safe to send",
      ],
      trustedReviewers: [
        { provider: "openrouter", model },
      ],
    },
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  return receipt.terminalVerdict === "accept" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
