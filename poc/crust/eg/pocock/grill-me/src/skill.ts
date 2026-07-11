import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type ResolvedGrillMeSkill = {
  name: "grill-me";
  path: string;
  version: string;
  content: string;
};

export async function resolveGrillMeSkill(path: string): Promise<ResolvedGrillMeSkill> {
  const resolvedPath = resolve(path);
  const content = await readFile(resolvedPath, "utf8");
  if (!/^---\s*\nname:\s*grill-me\s*\n/m.test(content)) {
    throw new Error(`${resolvedPath} is not a grill-me SKILL.md`);
  }
  const version = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  return { name: "grill-me", path: resolvedPath, version, content };
}

export function assertCompositionMatchesSkill(
  composition: { skill: string; version: string; source: string },
  skill: ResolvedGrillMeSkill,
): void {
  if (composition.skill !== skill.name || composition.version !== skill.version || resolve(composition.source) !== skill.path) {
    throw new Error("locked skill differs from the installed grill-me skill; start a new run or restore the locked source");
  }
}
