import { describe, expect, test } from "bun:test";
import type { ArtifactSpec } from "../lib/artifact";
import {
  artifactCanClearGap,
  compileArtifactMechanic,
} from "../lib/game-engine";

const part: ArtifactSpec["parts"][number] = {
  primitive: "box",
  position: [0, 0, 0],
  scale: [1, 1, 1],
  rotation: [0, 0, 0],
  color: "#78f0c3",
};

describe("trusted artifact compiler", () => {
  test("compiles a full-span support into a gap bridge", () => {
    const spec: ArtifactSpec = {
      name: "Bridge",
      description: "A bridge covering the complete gap.",
      affordance: { kind: "support", span: 6 },
      parts: [part],
    };

    expect(compileArtifactMechanic(spec)).toEqual({
      kind: "support",
      x: 11,
      y: -2.55,
      width: 6,
      height: 0.4,
    });
    expect(artifactCanClearGap(spec)).toBe(true);
  });

  test("rejects support too short to cover the gap", () => {
    const spec: ArtifactSpec = {
      name: "Short bridge",
      description: "A bridge that leaves dangerous edges.",
      affordance: { kind: "support", span: 5.9 },
      parts: [part],
    };

    expect(artifactCanClearGap(spec)).toBe(false);
  });

  test("compiles a launcher and proves its minimum flight clears the gap", () => {
    const spec: ArtifactSpec = {
      name: "Launcher",
      description: "A launcher beside the gap.",
      affordance: { kind: "propel", force: 9 },
      parts: [part],
    };

    expect(compileArtifactMechanic(spec)).toEqual({
      kind: "propel",
      x: 7.15,
      width: 1.8,
      force: 9,
    });
    expect(artifactCanClearGap(spec)).toBe(true);
  });
});
