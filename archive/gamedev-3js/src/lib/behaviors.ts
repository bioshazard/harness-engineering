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

export function creatureIntent(
  elapsed: number,
  creature: WorldEntity,
  player: Point,
  entities: WorldEntity[],
) {
  const phase = elapsed % 18;
  if (phase < 6) {
    return {
      state: "wander" as const,
      target: {
        x: creature.position.x + Math.cos(elapsed * 0.7) * 1.4,
        z: creature.position.z + Math.sin(elapsed * 0.7) * 1.4,
      },
    };
  }
  if (phase < 12) {
    return { state: "follow" as const, target: player };
  }
  const tree = entities.find((entity) => entity.kind === "moon-tree");
  return {
    state: "feed" as const,
    target: tree?.position ?? creature.position,
    targetId: tree?.id,
  };
}

export function advanceCreature(position: Point, target: Point, delta: number) {
  return advanceMote(position, target, delta, 0.72);
}

export function wishBehaviorMotion(entity: WorldEntity) {
  if (entity.behavior?.motion) return entity.behavior.motion;
  if (entity.behavior?.kind === "lantern-eater") return "hunt-lanterns";
  if (entity.behavior?.kind === "tree-friend") return "orbit-tree";
  return "wander";
}

export function wishBehaviorIntent(
  elapsed: number,
  entity: WorldEntity,
  player: Point,
  entities: WorldEntity[],
) {
  const motion = wishBehaviorMotion(entity);
  if (motion === "follow-player") {
    return { state: "following player", target: player };
  }
  const tree = entities.find((candidate) => candidate.kind === "moon-tree");
  if (motion === "orbit-tree") {
    const origin = tree?.position ?? entity.position;
    return {
      state: tree ? `orbiting ${tree.id}` : "wandering",
      target: {
        x: origin.x + Math.cos(elapsed * 0.55) * 1.7,
        z: origin.z + Math.sin(elapsed * 0.55) * 1.7,
      },
    };
  }
  return {
    state: "wandering",
    target: {
      x: entity.position.x + Math.cos(elapsed * 0.7) * 1.4,
      z: entity.position.z + Math.sin(elapsed * 0.7) * 1.4,
    },
  };
}
