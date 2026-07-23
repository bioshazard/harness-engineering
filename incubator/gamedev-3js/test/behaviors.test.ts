import { describe, expect, test } from "bun:test";
import {
  advanceCreature,
  advanceMote,
  creatureIntent,
  moteSpawnPosition,
  nearestSeed,
} from "../src/lib/behaviors";
import type { WorldEntity } from "../src/lib/world";

const entities: WorldEntity[] = [
  {
    id: "tree",
    kind: "moon-tree",
    label: "Tree",
    position: { x: 3, z: 2 },
    scale: 1,
    tint: "#ffffff",
  },
  {
    id: "moth",
    kind: "creature",
    label: "Moth",
    position: { x: 0, z: 0 },
    scale: 1,
    tint: "#ffffff",
    creature: { state: "wander", energy: 100 },
  },
  {
    id: "seed",
    kind: "wish-seed",
    label: "Seed",
    position: { x: -2, z: -1 },
    scale: 1,
    tint: "#ffffff",
  },
];

describe("entity behaviors", () => {
  test("emits motes near a moon tree", () => {
    const position = moteSpawnPosition(2, entities);

    expect(Math.hypot(position.x - 3, position.z - 2)).toBeLessThan(1.2);
  });

  test("moves emitted motes toward the nearest seed", () => {
    const start = moteSpawnPosition(2, entities);
    const target = nearestSeed(start, entities);
    const next = advanceMote(start, target?.position, 1);

    expect(target?.id).toBe("seed");
    expect(Math.hypot(next.x + 2, next.z + 1)).toBeLessThan(
      Math.hypot(start.x + 2, start.z + 1),
    );
  });

  test("cycles a creature through wandering, following, and tree feeding", () => {
    const moth = entities[1];
    const wander = creatureIntent(1, moth, { x: 1, z: 1 }, entities);
    const follow = creatureIntent(7, moth, { x: 1, z: 1 }, entities);
    const feed = creatureIntent(13, moth, { x: 1, z: 1 }, entities);
    const next = advanceCreature(moth.position, follow.target, 1);

    expect(wander.state).toBe("wander");
    expect(follow.state).toBe("follow");
    expect(feed).toMatchObject({ state: "feed", targetId: "tree" });
    expect(Math.hypot(next.x - 1, next.z - 1)).toBeLessThan(Math.SQRT2);
  });
});
