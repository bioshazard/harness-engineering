import { describe, expect, test } from "bun:test";
import { validateArtifactSpec, type ArtifactSpec } from "../lib/artifact";

const validArtifact: ArtifactSpec = {
  name: "Pocket Bridge",
  description: "A compact bridge that unfolds across the gap.",
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

describe("artifact harness grammar", () => {
  test("accepts a bounded artifact", () => {
    expect(validateArtifactSpec(validArtifact)).toEqual(validArtifact);
  });

  test("rejects capabilities outside the grammar", () => {
    expect(() =>
      validateArtifactSpec({
        ...validArtifact,
        affordance: { kind: "run_shell", command: "rm -rf data" },
      }),
    ).toThrow("affordance.kind");
  });

  test("rejects the redundant connect affordance", () => {
    expect(() =>
      validateArtifactSpec({
        ...validArtifact,
        affordance: { kind: "connect", span: 6 },
      }),
    ).toThrow("affordance.kind");
  });

  test("rejects support that cannot span the complete gap", () => {
    expect(() =>
      validateArtifactSpec({
        ...validArtifact,
        affordance: { kind: "support", span: 5.9 },
      }),
    ).toThrow("affordance.span");
  });

  test("rejects undeclared fields instead of silently dropping them", () => {
    expect(() =>
      validateArtifactSpec({
        ...validArtifact,
        script: "globalThis.doAnything()",
      }),
    ).toThrow("unknown fields");
  });

  test("rejects geometry outside engine budgets", () => {
    expect(() =>
      validateArtifactSpec({
        ...validArtifact,
        parts: [{ ...validArtifact.parts[0], scale: [1000, 1, 1] }],
      }),
    ).toThrow("scale");
  });
});
