import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorldConfig } from "../src/lib/world";
import {
  acceptWishProposal,
  createWishProposal,
} from "../src/lib/wish-loop";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Scribblenauts wish loop", () => {
  test("previews without mutation, then introduces only after acceptance", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "wish-loop-"));
    temporaryDirectories.push(directory);
    const proposalPath = path.join(directory, "proposal.json");
    const worldPath = path.join(directory, "world.json");
    const world: WorldConfig = {
      revision: 1,
      name: "Wish Test",
      palette: {
        sky: "#000000",
        fog: "#000000",
        ground: "#000000",
        groundEdge: "#000000",
        accent: "#ffffff",
        glow: "#ffffff",
      },
      population: { motes: 1, stones: 1, lanterns: 1 },
      economy: { sparks: 0, collectedMotes: [] },
      entities: [],
      history: { past: [], future: [] },
    };
    await writeFile(worldPath, JSON.stringify(world));

    const proposal = await createWishProposal(
      "a lantern-eating moon fox",
      {
        filePath: proposalPath,
        createId: () => "proposal-one",
        now: () => new Date("2026-07-23T12:00:00.000Z"),
      },
    );
    const beforeAcceptance = JSON.parse(await readFile(worldPath, "utf8"));
    const accepted = await acceptWishProposal(proposal.id, {
      proposalPath,
      worldPath,
      createEntityId: () => "moon-fox-one",
      now: () => new Date("2026-07-23T12:01:00.000Z"),
    });

    expect(proposal).toMatchObject({
      asset: "/moon-fox.png",
      behavior: { kind: "lantern-eater" },
    });
    expect(beforeAcceptance.entities).toHaveLength(0);
    expect(accepted.entity.id).toBe("moon-fox-one");
    expect(accepted.world.history.past[0].action).toBe(
      "Accepted wish moon-fox-one",
    );
    expect(accepted.proposal.acceptedAt).toBeDefined();
  });
});
