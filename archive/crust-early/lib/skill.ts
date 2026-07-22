import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type ResolvedSkill<Name extends string = string> = {
  name: Name;
  path: string;
  version: string;
  content: string;
};

export async function resolveSkill<Name extends string>(path: string, expectedName: Name): Promise<ResolvedSkill<Name>> {
  const resolvedPath = resolve(path);
  const content = await readFile(resolvedPath, "utf8");
  if (!new RegExp(`^---\\s*\\nname:\\s*${escapeRegex(expectedName)}\\s*\\n`, "m").test(content)) {
    throw new Error(`${resolvedPath} is not a ${expectedName} SKILL.md`);
  }
  return {
    name: expectedName,
    path: resolvedPath,
    version: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    content,
  };
}

export function assertCompositionMatchesSkill(
  composition: { skill: string; version: string; source: string },
  skill: ResolvedSkill,
): void {
  if (composition.skill !== skill.name || composition.version !== skill.version || resolve(composition.source) !== skill.path) {
    throw new Error(`locked ${composition.skill} skill differs from the installed source; start a new run or restore the lock`);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
