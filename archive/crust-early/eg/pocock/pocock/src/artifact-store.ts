import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type ActivePhase, PocockWorkflow, type ArtifactKind, type ArtifactReceipt } from "./workflow.js";

const KIND_PHASE: Record<ArtifactKind, ActivePhase> = {
  "spec.md": "SPECIFYING",
  "slices.json": "SLICING",
  "implementation.md": "IMPLEMENTING",
  "review.md": "REVIEWING",
};

const MAX_ARTIFACT_BYTES = 1_048_576;

/** Narrow custody mechanism for self-attested, phase-local intermediate artifacts. */
export class PhaseArtifactStore {
  constructor(private readonly runDirectory: string, private readonly workflow: PocockWorkflow) {}

  async stage(kind: ArtifactKind, content: string): Promise<ArtifactReceipt> {
    const phase = this.workflow.state.phase;
    if (phase === "DONE") throw new Error("cannot stage an artifact after DONE");
    if (KIND_PHASE[kind] !== phase) throw new Error(`${kind} is only allowed in ${KIND_PHASE[kind]}`);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_ARTIFACT_BYTES) throw new Error(`artifact exceeds ${MAX_ARTIFACT_BYTES} UTF-8 bytes`);

    const id = randomUUID();
    const prefix = kind.slice(0, kind.lastIndexOf("."));
    const extension = kind.slice(kind.lastIndexOf("."));
    await assertRealDirectory(this.runDirectory);
    const artifactRoot = join(this.runDirectory, "artifacts");
    await assertRealDirectory(artifactRoot);
    const directory = join(artifactRoot, phase);
    await assertRealDirectory(directory);
    const path = join(directory, `${prefix}-${id}${extension}`);
    const temporary = join(directory, `.${prefix}-${id}.${process.pid}.tmp`);
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    try {
      await link(temporary, path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }

    const receipt: ArtifactReceipt = {
      schema: "phase-artifact-receipt/v1",
      id: `artifact-${id}`,
      phase,
      kind,
      path,
      sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      bytes,
      createdAt: new Date().toISOString(),
    };
    this.workflow.recordArtifact(receipt);
    return receipt;
  }
}

async function assertRealDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`artifact custody path must be a real directory: ${path}`);
}
