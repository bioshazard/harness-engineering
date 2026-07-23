import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorldConfig, WorldEntity } from "./world";

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
  mutate: (world: WorldConfig) => { result: T; world: WorldConfig },
): Promise<{ result: T; world: WorldConfig }> {
  const operation = mutationQueue.then(async () => {
    const current = await readWorld(filePath);
    const mutation = mutate(current);
    await writeWorld(mutation.world, filePath);
    return mutation;
  });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function plantWishSeed(
  position: { x: number; z: number },
  options: { filePath?: string; createId?: () => string } = {},
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

  return updateWorld(filePath, (world) => {
    const entity: WorldEntity = {
      id: createId(),
      kind: "wish-seed",
      label: `Wish seed ${world.entities.filter((item) => item.kind === "wish-seed").length + 1}`,
      position,
      scale: 1,
      tint: "#ffffff",
    };
    const next = {
      ...world,
      revision: world.revision + 1,
      entities: [...world.entities, entity],
    };
    return { result: entity, world: next };
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
    return { result: entity, world: next };
  });
}
