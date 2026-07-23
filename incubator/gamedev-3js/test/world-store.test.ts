import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorldConfig } from "../src/lib/world";
import { plantWishSeed } from "../src/lib/world-store";

const temporaryDirectories: string[] = [];

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "wish-garden-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "world.json");
  const world: WorldConfig = {
    revision: 3,
    name: "Test Garden",
    palette: {
      sky: "#000000",
      fog: "#000000",
      ground: "#000000",
      groundEdge: "#000000",
      accent: "#ffffff",
      glow: "#ffffff",
    },
    population: { motes: 1, stones: 1, lanterns: 1 },
    entities: [],
  };
  await writeFile(filePath, JSON.stringify(world));
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("persistent planting", () => {
  test("adds an inspectable seed and increments the persisted revision", async () => {
    const filePath = await fixture();

    const mutation = await plantWishSeed(
      { x: 1.25, z: -2.5 },
      { filePath, createId: () => "wish-test" },
    );

    expect(mutation.result).toEqual({
      id: "wish-test",
      kind: "wish-seed",
      label: "Wish seed 1",
      position: { x: 1.25, z: -2.5 },
      scale: 1,
      tint: "#ffffff",
    });
    expect(mutation.world.revision).toBe(4);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(mutation.world);
  });

  test("rejects planting outside the island", async () => {
    const filePath = await fixture();

    expect(() => plantWishSeed({ x: 8, z: 0 }, { filePath })).toThrow(
      "inside the garden",
    );
  });
});
