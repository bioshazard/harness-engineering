import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorldConfig } from "../src/lib/world";
import {
  acceptWishProposal,
  createWishProposal,
  rejectWishProposal,
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
    const assetsDirectory = path.join(directory, "assets");
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
        assetsDirectory,
        createId: () => "proposal-one",
        now: () => new Date("2026-07-23T12:00:00.000Z"),
        worker: async ({ imagePath }) => {
          await writeFile(
            imagePath,
            Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          );
          return {
            label: "Lantern-eating moon fox",
            behavior: {
              motion: "hunt-lanterns",
              speed: 0.72,
              summary: "Hunts the nearest lantern.",
            },
            model: "fake/wish-worker",
          };
        },
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
      asset: "/api/wish-assets/proposal-one",
      behavior: { motion: "hunt-lanterns", speed: 0.72 },
      model: "fake/wish-worker",
    });
    expect(
      Uint8Array.from(
        await readFile(path.join(assetsDirectory, "proposal-one.png")),
      ).slice(0, 4),
    ).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    expect(beforeAcceptance.entities).toHaveLength(0);
    expect(accepted.entity.id).toBe("moon-fox-one");
    expect(accepted.world.history.past[0].action).toBe(
      "Accepted wish moon-fox-one",
    );
    expect(accepted.proposal.acceptedAt).toBeDefined();
  });

  test("rejects a proposal and removes its generated asset", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "wish-reject-"));
    temporaryDirectories.push(directory);
    const proposalPath = path.join(directory, "proposal.json");
    const assetsDirectory = path.join(directory, "assets");
    const proposal = await createWishProposal("a shy comet crab", {
      filePath: proposalPath,
      assetsDirectory,
      createId: () => "proposal-two",
      worker: async ({ imagePath }) => {
        await writeFile(
          imagePath,
          Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
        return {
          label: "Shy comet crab",
          behavior: {
            motion: "orbit-tree",
            speed: 0.4,
            summary: "Orbits the nearest moon tree.",
          },
          model: "fake/wish-worker",
        };
      },
    });

    await rejectWishProposal(proposal.id, { proposalPath, assetsDirectory });

    await expect(readFile(proposalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(assetsDirectory, "proposal-two.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
