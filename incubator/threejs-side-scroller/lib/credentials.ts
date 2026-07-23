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

export async function loadPiCredentials(path: string) {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const store = new InMemoryCredentialStore();
  for (const [provider, value] of Object.entries(parsed)) {
    if (!isCredential(value)) throw new Error(`invalid credential for ${provider}`);
    await store.modify(provider, async () => value);
  }
  return store;
}
