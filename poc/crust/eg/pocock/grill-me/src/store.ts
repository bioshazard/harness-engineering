import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { GrillingRun } from "./workflow.js";

export class FileRunStore {
  constructor(private readonly directory: string) {}

  path(runId: string): string {
    return join(this.directory, `${runId}.json`);
  }

  async save(run: GrillingRun): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(run.id);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }

  async load(runId: string): Promise<GrillingRun> {
    const path = this.path(runId);
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as GrillingRun;
  }
}
