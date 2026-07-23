import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorldConfig } from "../src/lib/world";
import { collectSpark, plantWishSeed, updateEntity } from "../src/lib/world-store";

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
    economy: { sparks: 1, collectedMotes: [] },
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
    expect(mutation.world.economy.sparks).toBe(0);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(mutation.world);
  });

  test("rejects planting outside the island", async () => {
    const filePath = await fixture();

    expect(() => plantWishSeed({ x: 8, z: 0 }, { filePath })).toThrow(
      "inside the garden",
    );
  });
});

describe("spark economy", () => {
  test("collects each mote once and spends one spark per seed", async () => {
    const filePath = await fixture();

    const collected = await collectSpark(0, { filePath });
    const duplicate = await collectSpark(0, { filePath });
    await plantWishSeed(
      { x: 0, z: 0 },
      { filePath, createId: () => "spark-seed" },
    );
    const world = JSON.parse(await readFile(filePath, "utf8")) as WorldConfig;

    expect(collected.result).toBe(true);
    expect(duplicate.result).toBe(false);
    expect(world.economy).toEqual({ sparks: 1, collectedMotes: [0] });
    expect(world.entities.at(-1)?.id).toBe("spark-seed");
  });
});

describe("direct manipulation", () => {
  test("persists position, scale, and tint edits together", async () => {
    const filePath = await fixture();
    await plantWishSeed(
      { x: 0, z: 0 },
      { filePath, createId: () => "editable-seed" },
    );

    const mutation = await updateEntity(
      "editable-seed",
      {
        position: { x: 2, z: -3 },
        scale: 1.5,
        tint: "#aabbcc",
      },
      { filePath },
    );

    expect(mutation.result.position).toEqual({ x: 2, z: -3 });
    expect(mutation.result.scale).toBe(1.5);
    expect(mutation.result.tint).toBe("#aabbcc");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(mutation.world);
  });

  test("rejects invalid scale edits", async () => {
    const filePath = await fixture();

    expect(() => updateEntity("missing", { scale: 10 }, { filePath })).toThrow(
      "between 0.25 and 4",
    );
  });
});
