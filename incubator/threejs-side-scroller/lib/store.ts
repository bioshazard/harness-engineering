import "server-only";

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ArtifactSpec, ForgedArtifact } from "./artifact";

let database: Database | undefined;

function dataRoot() {
  return process.env.GAME_DATA_DIR ?? join(process.cwd(), "data");
}

async function openDatabase() {
  if (database) return database;
  const root = dataRoot();
  await mkdir(root, { recursive: true });
  database = new Database(join(root, "game.sqlite"), { create: true });
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      progress INTEGER NOT NULL,
      completed INTEGER NOT NULL,
      artifact_id TEXT,
      recorded_at TEXT NOT NULL
    );
  `);
  return database;
}

export async function saveArtifact(input: {
  prompt: string;
  model: string;
  spec: ArtifactSpec;
}): Promise<ForgedArtifact> {
  const canonical = JSON.stringify(input.spec);
  const id = createHash("sha256")
    .update(JSON.stringify({ prompt: input.prompt, model: input.model, spec: input.spec }))
    .digest("hex")
    .slice(0, 20);
  const createdAt = new Date().toISOString();
  const db = await openDatabase();
  db.run(
    `INSERT OR REPLACE INTO artifacts (id, prompt, model, spec_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.prompt, input.model, canonical, createdAt],
  );

  const artifactRoot = join(dataRoot(), "artifacts", id);
  await mkdir(artifactRoot, { recursive: true });
  await Promise.all([
    writeFile(join(artifactRoot, "manifest.json"), `${canonical}\n`),
    writeFile(
      join(artifactRoot, "receipt.json"),
      `${JSON.stringify({
        id,
        prompt: input.prompt,
        model: input.model,
        createdAt,
        specHash: createHash("sha256").update(canonical).digest("hex"),
      }, null, 2)}\n`,
    ),
  ]);

  return { id, prompt: input.prompt, model: input.model, spec: input.spec };
}

export async function recordProgress(input: {
  progress: number;
  completed: boolean;
  artifactId?: string;
}) {
  const db = await openDatabase();
  db.run(
    `INSERT INTO game_progress (progress, completed, artifact_id, recorded_at)
     VALUES (?, ?, ?, ?)`,
    [
      input.progress,
      input.completed ? 1 : 0,
      input.artifactId ?? null,
      new Date().toISOString(),
    ],
  );
}
