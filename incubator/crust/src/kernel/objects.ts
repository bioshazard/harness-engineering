import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { CrustError, type ArtifactRef } from "./types.js";
import { canonical, sha256 } from "./hash.js";

export async function directoryHash(directory: string): Promise<string> {
  const files: Array<{ path: string; content: Buffer }> = [];
  const root = await realpath(directory);
  const visit = async (path: string): Promise<void> => {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new CrustError("SYMLINK_REJECTED", "Skill cannot contain symlinks");
    if (stat.isDirectory()) { for (const entry of await readdir(path)) await visit(join(path, entry)); return; }
    if (stat.isFile()) files.push({ path: relative(root, path).split(sep).join("/"), content: await readFile(path) });
  };
  await visit(root); files.sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file.path); hash.update(file.content); }
  return hash.digest("hex");
}

export class ObjectStore {
  constructor(private readonly root: string, private readonly maxBytes = 4 * 1024 * 1024) {}

  async put(data: Uint8Array | string, mediaType = "application/octet-stream"): Promise<ArtifactRef> {
    const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    if (bytes.length > this.maxBytes) throw new CrustError("ARTIFACT_TOO_LARGE", "Artifact exceeds size limit");
    const hash = sha256(bytes);
    const path = this.path(hash);
    await mkdir(dirname(path), { recursive: true });
    try {
      const existing = await readFile(path);
      if (sha256(existing) !== hash) throw new CrustError("OBJECT_TAMPERED", `Object ${hash} is corrupt`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(path, bytes, { flag: "wx", mode: 0o444 });
    }
    return { hash, bytes: bytes.length, mediaType };
  }

  async get(ref: ArtifactRef): Promise<Buffer> {
    const data = await readFile(this.path(ref.hash));
    if (data.length !== ref.bytes || sha256(data) !== ref.hash) throw new CrustError("OBJECT_TAMPERED", `Object ${ref.hash} failed verification`);
    return data;
  }

  async snapshot(sourceDir: string, paths: string[]): Promise<{ object: ArtifactRef; files: Record<string, string> }> {
    const root = await realpath(sourceDir);
    const files: Record<string, string> = {};
    const bodies: Record<string, string> = {};
    for (const requested of paths) await this.walk(root, resolve(root, requested), files, bodies);
    const object = await this.put(canonical(bodies), "application/vnd.crust.composition+json");
    return { object, files };
  }

  private async walk(root: string, path: string, files: Record<string, string>, bodies: Record<string, string>): Promise<void> {
    if (path !== root && !path.startsWith(`${root}${sep}`)) throw new CrustError("PATH_ESCAPE", "Snapshot path escapes source root");
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new CrustError("SYMLINK_REJECTED", "Composition cannot contain symlinks");
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await this.walk(root, join(path, entry), files, bodies);
      return;
    }
    if (!stat.isFile()) return;
    const key = relative(root, path).split(sep).join("/");
    const body = await readFile(path);
    files[key] = sha256(body);
    bodies[key] = body.toString("base64");
  }

  private path(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new CrustError("INVALID_HASH", "Invalid object hash");
    return join(this.root, hash.slice(0, 2), hash.slice(2));
  }
}
