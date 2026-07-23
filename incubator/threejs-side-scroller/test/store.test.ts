import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ArtifactSpec } from "../lib/artifact";
import { listArtifacts, saveArtifact } from "../lib/store";

const dataRoot = await mkdtemp(join(tmpdir(), "threejs-side-scroller-"));
process.env.GAME_DATA_DIR = dataRoot;

afterAll(async () => {
  await rm(dataRoot, { recursive: true, force: true });
});

describe("artifact store", () => {
  test("saved evidence can be listed for replay", async () => {
    const spec: ArtifactSpec = {
      name: "Replay Bridge",
      description: "A bridge retained as durable evidence.",
      affordance: { kind: "support", span: 6 },
      parts: [
        {
          primitive: "box",
          position: [0, 0, 0],
          scale: [6, 0.3, 2],
          rotation: [0, 0, 0],
          color: "#78f0c3",
        },
      ],
    };

    const saved = await saveArtifact({
      prompt: "make a replayable bridge",
      model: "test/model",
      spec,
    });
    const replayable = await listArtifacts();

    expect(saved.receipt.specHash).toHaveLength(64);
    expect(replayable).toEqual([saved]);
  });
});
