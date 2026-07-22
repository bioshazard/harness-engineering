#!/usr/bin/env bun

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [targetArg, ...piArgs] = process.argv.slice(2);
if (!targetArg || targetArg.startsWith("-")) {
  process.stderr.write("Usage: bun run crust -- <target-directory> [pi-options]\n");
  process.exit(2);
}

const target = resolve(targetArg);
mkdirSync(target, { recursive: true });
if (!prepared(target)) {
  process.stderr.write(`Preparing pinned Crust skills in ${target}\n`);
  execFileSync(process.execPath, [resolve(root, "scripts/install-skills.mjs"), target], { stdio: "inherit" });
}

process.stderr.write(`Crust target: ${target}\nStart with: /crust start <idea>\n`);
const result = spawnSync(resolve(root, "node_modules/.bin/pi"), [
  "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files",
  "--no-builtin-tools", "--extension", resolve(root, ".pi/extensions/crust.ts"), ...piArgs,
], { cwd: target, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function prepared(directory) {
  const targetLockPath = resolve(directory, ".crust/skills-lock.json");
  if (!existsSync(targetLockPath)) return false;
  try {
    const expected = JSON.parse(readFileSync(resolve(root, "skills-lock.json"), "utf8"));
    const actual = JSON.parse(readFileSync(targetLockPath, "utf8"));
    return Object.keys(actual.skills).length === Object.keys(expected.skills).length && Object.entries(expected.skills).every(([name, skill]) =>
      actual.skills?.[name]?.computedHash === skill.computedHash &&
      existsSync(resolve(directory, ".pi/skills", name, "SKILL.md"))
    );
  } catch {
    return false;
  }
}
