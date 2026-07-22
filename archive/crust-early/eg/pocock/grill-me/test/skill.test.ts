import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertCompositionMatchesSkill,
  resolveGrillMeSkill,
} from "../src/skill.js";

const skill = `---
name: grill-me
description: Test skill
---

Ask one question at a time.
`;

test("resolves the exact grill-me source and locks its content hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crust-skill-"));
  const path = join(directory, "SKILL.md");
  await writeFile(path, skill);

  const resolved = await resolveGrillMeSkill(path);

  assert.equal(resolved.name, "grill-me");
  assert.match(resolved.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(resolved.content, skill);
});

test("rejects a resumed composition when the installed skill changed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crust-skill-"));
  const path = join(directory, "SKILL.md");
  await writeFile(path, skill);
  const original = await resolveGrillMeSkill(path);
  await writeFile(path, `${skill}\nChanged.`);
  const current = await resolveGrillMeSkill(path);

  assert.throws(
    () => assertCompositionMatchesSkill({ skill: "grill-me", version: original.version, source: original.path }, current),
    /locked skill differs/,
  );
});
