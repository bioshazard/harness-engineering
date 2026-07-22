import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type IdentifiedRun = { id: string };

/** Durable JSON persistence for Crust control-plane state. */
export class FileRunStore<Run extends IdentifiedRun = IdentifiedRun> {
  constructor(private readonly directory: string) {}

  path(runId: string): string {
    return join(this.directory, `${runId}.json`);
  }

  runDirectory(runId: string): string {
    return join(this.directory, runId);
  }

  async save(run: Run): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(run.id);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }

  async load(runId: string): Promise<Run> {
    return JSON.parse(await readFile(this.path(runId), "utf8")) as Run;
  }
}
