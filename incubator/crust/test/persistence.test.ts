import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createCrustKernel } from "../src/kernel/kernel.js";
import { directoryHash } from "../src/kernel/objects.js";
import { PocockClient } from "../src/pocock/client.js";

it("keeps normalized authoritative rows and rejects persisted tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "crust-persistence-"));
  const skills = join(root, "skills");
  for (const name of ["grill-with-docs", "grilling", "domain-modeling", "to-spec", "codebase-design", "to-tickets", "implement", "tdd", "code-review"]) {
    await mkdir(join(skills, name), { recursive: true });
    await writeFile(join(skills, name, "SKILL.md"), `# ${name}`);
  }
  const lock = Object.fromEntries(await Promise.all(["grill-with-docs", "grilling", "domain-modeling", "to-spec", "codebase-design", "to-tickets", "implement", "tdd", "code-review"].map(async (name) => [name, await directoryHash(join(skills, name))])));
  const database = join(root, ".crust", "crust.sqlite");
  const kernel = createCrustKernel({ root: join(root, ".crust"), client: new PocockClient(), skills: { dir: skills, source: "mattpocock/skills", revision: "d574778f94cf620fcc8ce741584093bc650a61d3", lock }, runtime: { provider: "openai-codex", model: "gpt-5.4", thinking: "high" } });
  let run = await kernel.createRun({ idea: "persist", sessionId: "shape" });
  run = await kernel.child(run.id, "shape").propose(run.revision, { decisions: ["one"], glossary: [], adrs: [] });

  const db = new DatabaseSync(database);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(({ name }) => name);
  expect(tables).toEqual(expect.arrayContaining(["runs", "proposals", "tickets", "sessions", "receipts", "transitions"]));
  expect((db.prepare("SELECT count(*) AS count FROM proposals WHERE run_id=?").get(run.id) as { count: number }).count).toBe(1);
  db.prepare("UPDATE proposals SET body='{}' WHERE run_id=?").run(run.id);
  expect(() => kernel.run(run.id)).toThrow(/proposal/i);
  db.close();
});
