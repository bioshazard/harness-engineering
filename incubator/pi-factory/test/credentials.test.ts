import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCredentials } from "../src/factory/credentials.js";

test("copies mounted credentials into memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-auth-"));
  const path = join(root, "auth.json");
  try {
    await writeFile(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "access",
          refresh: "refresh",
          expires: Date.now() + 60_000,
        },
      }),
    );
    const credentials = await loadCredentials(path);
    expect((await credentials.read("openai-codex"))?.type).toBe("oauth");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
