import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCatalog } from "./catalog";
import type {
  EntityType,
  WorldConfig,
  WorldEntity,
  WorldSnapshot,
} from "./world";

export const worldFilePath = path.join(process.cwd(), "public", "world.json");

let mutationQueue = Promise.resolve();

export async function readWorld(filePath = worldFilePath): Promise<WorldConfig> {
  return JSON.parse(await readFile(filePath, "utf8")) as WorldConfig;
}

async function writeWorld(world: WorldConfig, filePath: string) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(world, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function updateWorld<T>(
  filePath: string,
  mutate: (world: WorldConfig) => {
    result: T;
    world: WorldConfig;
    action?: string;
  },
): Promise<{ result: T; world: WorldConfig }> {
  const operation = mutationQueue.then(async () => {
    const current = await readWorld(filePath);
    const mutation = mutate(current);
    const world = mutation.action
      ? {
          ...mutation.world,
          history: {
            past: [
              ...(current.history?.past ?? []),
              {
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                action: mutation.action,
                before: snapshotWorld(current),
                after: snapshotWorld(mutation.world),
              },
            ],
            future: [],
          },
        }
      : mutation.world;
    await writeWorld(world, filePath);
    return { result: mutation.result, world };
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function snapshotWorld(world: WorldConfig): WorldSnapshot {
  return structuredClone({
    name: world.name,
    palette: world.palette,
    population: world.population,
    economy: world.economy,
    entities: world.entities,
  });
}

function restoreSnapshot(
  current: WorldConfig,
  snapshot: WorldSnapshot,
): WorldConfig {
  return {
    ...current,
    ...structuredClone(snapshot),
    revision: current.revision + 1,
  };
}

export function undoWorld(options: { filePath?: string } = {}) {
  const filePath = options.filePath ?? worldFilePath;
  const operation = mutationQueue.then(async () => {
    const current = await readWorld(filePath);
    const entry = current.history.past.at(-1);
    if (!entry) throw new Error("Nothing to undo.");
    const world = {
      ...restoreSnapshot(current, entry.before),
      history: {
        past: current.history.past.slice(0, -1),
        future: [entry, ...current.history.future],
      },
    };
    await writeWorld(world, filePath);
    return world;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function redoWorld(options: { filePath?: string } = {}) {
  const filePath = options.filePath ?? worldFilePath;
  const operation = mutationQueue.then(async () => {
    const current = await readWorld(filePath);
    const entry = current.history.future[0];
    if (!entry) throw new Error("Nothing to redo.");
    const world = {
      ...restoreSnapshot(current, entry.after),
      history: {
        past: [...current.history.past, entry],
        future: current.history.future.slice(1),
      },
    };
    await writeWorld(world, filePath);
    return world;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function plantWishSeed(
  position: { x: number; z: number },
  options: {
    filePath?: string;
    createId?: () => string;
    now?: () => Date;
  } = {},
) {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z) ||
    Math.hypot(position.x, position.z) > 7.75
  ) {
    throw new Error("Seed position must be finite and inside the garden.");
  }

  const filePath = options.filePath ?? worldFilePath;
  const createId = options.createId ?? (() => `wish-${randomUUID().slice(0, 8)}`);
  const now = (options.now ?? (() => new Date()))().toISOString();

  return updateWorld(filePath, (world) => {
    if (world.economy.sparks < 1) {
      throw new Error("Collect a spark before planting.");
    }
    const entity: WorldEntity = {
      id: createId(),
      kind: "wish-seed",
      label: `Wish seed ${world.entities.filter((item) => item.kind === "wish-seed").length + 1}`,
      position,
      scale: 1,
      tint: "#ffffff",
      growth: { stage: "seed", plantedAt: now, stageStartedAt: now },
    };
    const next = {
      ...world,
      revision: world.revision + 1,
      economy: { ...world.economy, sparks: world.economy.sparks - 1 },
      entities: [...world.entities, entity],
    };
    return { result: entity, world: next, action: `Placed ${entity.id}` };
  });
}

export async function placeCatalogEntity(
  position: { x: number; z: number },
  assetId: string,
  options: {
    filePath?: string;
    catalog?: EntityType[];
    createId?: () => string;
  } = {},
) {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z) ||
    Math.hypot(position.x, position.z) > 7.75
  ) {
    throw new Error("Entity position must be finite and inside the garden.");
  }
  const catalog = options.catalog ?? (await readCatalog());
  const type = catalog.find((entry) => entry.id === assetId);
  if (!type) throw new Error(`Unknown entity type: ${assetId}`);

  return updateWorld(options.filePath ?? worldFilePath, (world) => {
    if (world.economy.sparks < 1) {
      throw new Error("Collect a spark before placing an entity.");
    }
    const entity: WorldEntity = {
      id:
        options.createId?.() ??
        `${type.id}-${randomUUID().slice(0, 8)}`,
      kind: type.kind,
      label: type.label,
      position,
      scale: type.defaultScale,
      tint: "#ffffff",
      asset: type.asset,
      creature:
        type.kind === "creature"
          ? { state: "wander", energy: 100 }
          : undefined,
    };
    const next = {
      ...world,
      revision: world.revision + 1,
      economy: { ...world.economy, sparks: world.economy.sparks - 1 },
      entities: [...world.entities, entity],
    };
    return { result: entity, world: next, action: `Placed ${entity.id}` };
  });
}

const growthWaitMs = 5_000;

export function growEntity(
  id: string,
  options: { filePath?: string; now?: () => Date } = {},
) {
  const now = (options.now ?? (() => new Date()))();

  return updateWorld(options.filePath ?? worldFilePath, (world) => {
    const index = world.entities.findIndex((entity) => entity.id === id);
    if (index < 0) throw new Error(`Unknown entity: ${id}`);
    const current = world.entities[index];
    if (!current.growth || current.growth.stage === "mature") {
      throw new Error("This entity cannot grow further.");
    }
    if (world.economy.sparks < 1) {
      throw new Error("Collect a spark before nourishing growth.");
    }
    const elapsed = now.getTime() - new Date(current.growth.stageStartedAt).getTime();
    if (elapsed < growthWaitMs) {
      throw new Error("This growth stage needs more time.");
    }

    const stage = current.growth.stage === "seed" ? "sprout" : "mature";
    const entity: WorldEntity = {
      ...current,
      kind: stage === "mature" ? "moon-tree" : current.kind,
      label: stage === "mature" ? `${current.label} tree` : current.label,
      growth: {
        ...current.growth,
        stage,
        stageStartedAt: now.toISOString(),
      },
    };
    const entities = [...world.entities];
    entities[index] = entity;
    const next = {
      ...world,
      revision: world.revision + 1,
      economy: { ...world.economy, sparks: world.economy.sparks - 1 },
      entities,
    };
    return {
      result: entity,
      world: next,
      action: `Grew ${entity.id} to ${stage}`,
    };
  });
}

export function collectSpark(
  moteIndex: number,
  options: { filePath?: string } = {},
) {
  if (!Number.isInteger(moteIndex) || moteIndex < 0) {
    throw new Error("Mote index must be a non-negative integer.");
  }

  return updateWorld(options.filePath ?? worldFilePath, (world) => {
    if (moteIndex >= world.population.motes) {
      throw new Error(`Unknown mote: ${moteIndex}`);
    }
    if (world.economy.collectedMotes.includes(moteIndex)) {
      return { result: false, world };
    }
    const next = {
      ...world,
      revision: world.revision + 1,
      economy: {
        sparks: world.economy.sparks + 1,
        collectedMotes: [...world.economy.collectedMotes, moteIndex],
      },
    };
    return { result: true, world: next, action: `Collected mote ${moteIndex}` };
  });
}

export type EntityPatch = Partial<Pick<WorldEntity, "position" | "scale" | "tint">>;

export function updateEntity(
  id: string,
  patch: EntityPatch,
  options: { filePath?: string } = {},
) {
  if (
    patch.position &&
    (!Number.isFinite(patch.position.x) ||
      !Number.isFinite(patch.position.z) ||
      Math.hypot(patch.position.x, patch.position.z) > 7.75)
  ) {
    throw new Error("Entity position must be finite and inside the garden.");
  }
  if (
    patch.scale !== undefined &&
    (!Number.isFinite(patch.scale) || patch.scale < 0.25 || patch.scale > 4)
  ) {
    throw new Error("Entity scale must be between 0.25 and 4.");
  }
  if (patch.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(patch.tint)) {
    throw new Error("Entity tint must be a six-digit hex color.");
  }

  return updateWorld(options.filePath ?? worldFilePath, (world) => {
    const index = world.entities.findIndex((entity) => entity.id === id);
    if (index < 0) throw new Error(`Unknown entity: ${id}`);
    const entity = { ...world.entities[index], ...patch };
    const entities = [...world.entities];
    entities[index] = entity;
    const next = { ...world, revision: world.revision + 1, entities };
    return { result: entity, world: next, action: `Edited ${entity.id}` };
  });
}
