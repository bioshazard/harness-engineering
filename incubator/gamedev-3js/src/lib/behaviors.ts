import type { WorldEntity } from "./world";

type Point = { x: number; z: number };

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 9187.23 + salt * 77.11) * 43758.5453;
  return value - Math.floor(value);
}

export function moteSpawnPosition(index: number, entities: WorldEntity[]): Point {
  const trees = entities.filter((entity) => entity.kind === "moon-tree");
  const emitter = trees[index % Math.max(trees.length, 1)];
  const origin = emitter?.position ?? { x: 0, z: 0 };
  const angle = seeded(index, 22) * Math.PI * 2;
  const radius = 0.35 + seeded(index, 23) * 0.8;
  return {
    x: origin.x + Math.cos(angle) * radius,
    z: origin.z + Math.sin(angle) * radius,
  };
}

export function nearestSeed(position: Point, entities: WorldEntity[]) {
  return entities
    .filter((entity) => entity.kind === "wish-seed")
    .reduce<WorldEntity | undefined>((nearest, entity) => {
      if (!nearest) return entity;
      const candidateDistance = Math.hypot(
        entity.position.x - position.x,
        entity.position.z - position.z,
      );
      const nearestDistance = Math.hypot(
        nearest.position.x - position.x,
        nearest.position.z - position.z,
      );
      return candidateDistance < nearestDistance ? entity : nearest;
    }, undefined);
}

export function advanceMote(
  position: Point,
  target: Point | undefined,
  delta: number,
  speed = 0.38,
): Point {
  if (!target) return position;
  const x = target.x - position.x;
  const z = target.z - position.z;
  const distance = Math.hypot(x, z);
  if (distance < 0.001) return position;
  const step = Math.min(distance, speed * delta);
  return {
    x: position.x + (x / distance) * step,
    z: position.z + (z / distance) * step,
  };
}
