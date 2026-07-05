import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact } from "./contracts.js";

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function identityProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(identityProjection);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const artifactReference =
    typeof object.name === "string" &&
    typeof object.path === "string" &&
    typeof object.sha256 === "string";
  return Object.fromEntries(
    Object.keys(object)
      .filter(
        (key) => key !== "id" && !(artifactReference && key === "path"),
      )
      .sort()
      .map((key) => [key, identityProjection(object[key])]),
  );
}

export function receiptId(receipt: unknown) {
  return sha256(JSON.stringify(identityProjection(receipt))).slice(0, 20);
}

export async function writeArtifact(
  root: string,
  name: string,
  content: string,
): Promise<Artifact> {
  await mkdir(root, { recursive: true });
  const path = join(root, `${randomUUID()}-${name}`);
  await writeFile(path, content, "utf8");
  return { name, path, sha256: sha256(content) };
}

export async function verifyArtifact(artifact: Artifact) {
  return sha256(await readFile(artifact.path)) === artifact.sha256;
}
