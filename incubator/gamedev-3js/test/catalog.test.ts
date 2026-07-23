import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importEntityAsset } from "../src/lib/catalog";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("asset catalog", () => {
  test("imports an image and registers a placeable entity type", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "wish-catalog-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "moon-moth.png");
    const catalogPath = path.join(directory, "entity-catalog.json");
    await writeFile(source, "fake png");
    await writeFile(catalogPath, "[]");

    const entry = await importEntityAsset(source, {
      catalogPath,
      publicDirectory: directory,
    });

    expect(entry.id).toBe("moon-moth");
    expect(JSON.parse(await readFile(catalogPath, "utf8"))).toEqual([entry]);
    expect(await readFile(path.join(directory, "entities", "moon-moth.png"), "utf8")).toBe(
      "fake png",
    );
  });
});
