import { assertCompositionMatchesSkill as assertLock, resolveSkill, type ResolvedSkill } from "../../../../lib/skill.js";

export type ResolvedGrillMeSkill = ResolvedSkill<"grill-me">;

export async function resolveGrillMeSkill(path: string): Promise<ResolvedGrillMeSkill> { return resolveSkill(path, "grill-me"); }

export function assertCompositionMatchesSkill(
  composition: { skill: string; version: string; source: string },
  skill: ResolvedGrillMeSkill,
): void {
  try { assertLock(composition, skill); } catch { throw new Error("locked skill differs from the installed grill-me skill; start a new run or restore the locked source"); }
}
