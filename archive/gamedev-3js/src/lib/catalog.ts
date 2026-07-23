import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EntityType } from "./world";

export const catalogFilePath = path.join(
  process.cwd(),
  "public",
  "entity-catalog.json",
);

export async function readCatalog(filePath = catalogFilePath) {
  return JSON.parse(await readFile(filePath, "utf8")) as EntityType[];
}

export function catalogId(name: string) {
  const id = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) throw new Error("Asset name must contain a letter or number.");
  return id;
}

export async function importEntityAsset(
  sourcePath: string,
  options: {
    id?: string;
    catalogPath?: string;
    publicDirectory?: string;
  } = {},
) {
  const id = options.id ?? catalogId(sourcePath);
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
    throw new Error("Entity id must be 2-32 lowercase letters, numbers, or hyphens.");
  }
  const extension = path.extname(sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error("Entity asset must be PNG, JPEG, or WebP.");
  }

  const catalogPath = options.catalogPath ?? catalogFilePath;
  const publicDirectory = options.publicDirectory ?? path.dirname(catalogPath);
  const directory = path.join(publicDirectory, "entities");
  const destination = path.join(directory, `${id}${extension}`);
  const catalog = await readCatalog(catalogPath);
  if (catalog.some((entry) => entry.id === id)) {
    throw new Error(`Entity type already exists: ${id}`);
  }

  await mkdir(directory, { recursive: true });
  await copyFile(sourcePath, destination);
  const entry: EntityType = {
    id,
    label: id.replace(/-/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()),
    kind: "catalog",
    asset: `/entities/${id}${extension}`,
    defaultScale: 1,
  };
  const temporaryPath = `${catalogPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify([...catalog, entry], null, 2)}\n`,
  );
  await rename(temporaryPath, catalogPath);
  return entry;
}
