import { readFile } from "node:fs/promises";
import {
  InMemoryCredentialStore,
  type Credential,
} from "@earendil-works/pi-ai";

function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "api_key" || type === "oauth";
}

export async function loadCredentials(
  authPath: string,
  runtime?: { provider: string; apiKey: string },
): Promise<InMemoryCredentialStore> {
  const store = new InMemoryCredentialStore();
  try {
    const parsed = JSON.parse(await readFile(authPath, "utf8")) as Record<string, unknown>;
    for (const [provider, value] of Object.entries(parsed)) {
      if (!isCredential(value)) throw new Error(`invalid credential for ${provider}`);
      await store.modify(provider, async () => value);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (runtime) {
    await store.modify(runtime.provider, async () => ({
      type: "api_key",
      key: runtime.apiKey,
    }));
  }
  return store;
}
