import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  CompositionLock,
  CompositionManifest,
  ManifestVersion,
  StoredLock,
} from "./types.js";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
  });
  await rename(temporary, path);
}

export class FileRegistryStore {
  constructor(readonly root: string) {}

  async putManifest(version: ManifestVersion): Promise<void> {
    await this.putOnce(
      join(this.root, "manifests", `${version.id.slice(7)}.json`),
      version.manifest,
    );
    await atomicJson(join(this.root, "names", `${version.manifest.name}.json`), {
      manifestVersionId: version.id,
    });
  }

  async getManifest(id: string): Promise<CompositionManifest> {
    return readJson(join(this.root, "manifests", `${id.slice(7)}.json`));
  }

  async getNamedManifest(name: string): Promise<string> {
    const value = await readJson<{ manifestVersionId: string }>(
      join(this.root, "names", `${name}.json`),
    );
    return value.manifestVersionId;
  }

  async putLock(stored: StoredLock): Promise<void> {
    await this.putOnce(
      join(this.root, "locks", `${stored.compositionId.slice(7)}.json`),
      stored.lock,
    );
  }

  async getLock(id: string): Promise<CompositionLock> {
    return readJson(join(this.root, "locks", `${id.slice(7)}.json`));
  }

  async promote(
    alias: string,
    targetManifestVersionId: string,
    expectedCurrent?: string,
  ): Promise<void> {
    const path = join(this.root, "aliases", `${alias}.json`);
    let previous: string | null = null;
    try {
      previous = (await readJson<{ manifestVersionId: string }>(path))
        .manifestVersionId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (expectedCurrent !== undefined && previous !== expectedCurrent) {
      throw new Error(
        `alias ${alias} expected ${expectedCurrent}, found ${previous ?? "none"}`,
      );
    }
    const event = {
      alias,
      previous,
      next: targetManifestVersionId,
      actor: process.env.USER ?? "local",
      at: new Date().toISOString(),
    };
    await atomicJson(path, { manifestVersionId: targetManifestVersionId });
    await atomicJson(
      join(
        this.root,
        "promotions",
        `${event.at.replaceAll(":", "-")}-${crypto.randomUUID()}.json`,
      ),
      event,
    );
  }

  async resolveAlias(alias: string): Promise<string> {
    return (
      await readJson<{ manifestVersionId: string }>(
        join(this.root, "aliases", `${alias}.json`),
      )
    ).manifestVersionId;
  }

  private async putOnce(path: string, value: unknown): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(path, "utf8");
      if (existing !== `${JSON.stringify(value, null, 2)}\n`) {
        throw new Error(`immutable registry collision at ${path}`);
      }
    }
  }
}
