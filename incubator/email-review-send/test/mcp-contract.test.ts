import assert from "node:assert/strict";
import test from "node:test";
import { draftMcp } from "../src/mcp.js";
import {
  APPROVED_BODY,
  fixture,
  SOURCE_BODY,
  state,
  THREAD,
} from "./helpers.js";

test("draft MCP exposes explicit read and verified draft creation", async () => {
  const { provider } = fixture();
  const mcp = draftMcp(provider);
  const thread = await mcp.readThread(THREAD);
  assert.equal(thread.body, SOURCE_BODY);
  const result = await mcp.createReplyDraft(THREAD, APPROVED_BODY);
  assert.equal(result.verifiedUnsent, true);
  assert.deepEqual(result.draft.to, ["alice@example.test"]);
  assert.equal(result.draft.subject, "Re: Launch date");
  assert.deepEqual(result.draft.attachments, []);
  assert.deepEqual(
    provider.mutations().map((mutation) => mutation.operation),
    ["draft.create"],
  );
});

test("draft MCP interface contains no send operation", () => {
  const { provider } = fixture();
  assert.deepEqual(Object.keys(draftMcp(provider)).sort(), [
    "createReplyDraft",
    "readDraft",
    "readThread",
  ]);
});

test("explicit thread read does not disclose unrelated mailbox State", async () => {
  const { draftMcp: mcp } = fixture();
  const result = await mcp.readThread(THREAD);
  assert.ok(!JSON.stringify(result).includes("Unrelated private content"));
  assert.equal(state().messages.length, 2);
});
