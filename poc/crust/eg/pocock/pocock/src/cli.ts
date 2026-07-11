import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { FileRunStore } from "../../../../lib/store.js";
import { assertCompositionMatchesSkill, resolveSkill } from "../../../../lib/skill.js";
import { ACTIVE_PHASES, PocockWorkflow, type ActivePhase, type PocockRun } from "./workflow.js";

const MODEL = "openai-codex/gpt-5.5";
const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const values = (name: string) => args.flatMap((arg, index) => args[index - 1] === name ? [arg] : []);
const action = value("--action") ?? "status";
const store = new FileRunStore<PocockRun>(resolve(value("--run-dir") ?? ".crust/runs"));
const runId = value("--run");

if (args.includes("--help")) {
  console.log("bun run crust:pocock -- --action start --intent <text> [--question id:prompt] | --run <id> --action status|propose-decision|propose-spec|propose-slices|propose-implementation|propose-review|approve|reject|advance");
  process.exit(0);
}

if (action === "start") {
  const intent = value("--intent");
  if (!intent) throw new Error("--intent is required when starting a run");
  const compositions = Object.fromEntries(await Promise.all(ACTIVE_PHASES.map(async (phase) => {
    const skillName = skillFor(phase);
    const path = resolve(value(`--${phase.toLowerCase()}-skill`) ?? join(homedir(), ".agents", "skills", skillName, "SKILL.md"));
    const skill = await resolveSkill(path, skillName);
    return [phase, { skill: skill.name, version: skill.version, source: skill.path, model: MODEL }];
  }))) as PocockRun["compositions"];
  const questions = values("--question").map((raw, index) => {
    const [id, ...prompt] = raw.split(":");
    if (!id || !prompt.length) throw new Error(`invalid --question ${raw}; expected id:prompt`);
    return { id: id || `question-${index + 1}`, prompt: prompt.join(":"), required: true };
  });
  const run = PocockWorkflow.create({ id: `pocock-${randomUUID()}`, intent, questions: questions.length ? questions : [{ id: "design", prompt: "What material design decision must be resolved?", required: true }], compositions });
  await store.save(run); console.log(run.id); process.exit(0);
}

if (!runId) throw new Error("--run is required (or use --action start)");
const workflow = new PocockWorkflow(await store.load(runId));
await Promise.all(ACTIVE_PHASES.map(async (phase) => {
  const composition = workflow.state.compositions[phase];
  assertCompositionMatchesSkill(composition, await resolveSkill(composition.source, composition.skill));
}));
if (action === "status") console.log(JSON.stringify({ id: workflow.state.id, phase: workflow.state.phase, context: workflow.contextProjection() }, null, 2));
else if (action === "propose-decision") workflow.proposeDecision(json());
else if (action === "propose-spec") { const input = json<{ reference: string }>(); workflow.proposeSpec(input.reference, await readFile(resolve(input.reference), "utf8")); }
else if (action === "propose-slices") workflow.proposeSlices(json());
else if (action === "propose-implementation") workflow.proposeImplementation(json());
else if (action === "propose-review") workflow.proposeReview(json());
else if (action === "approve") workflow.approve(required("--proposal"), required("--operator"));
else if (action === "reject") workflow.reject(required("--proposal"), required("--operator"), value("--reason"));
else if (action === "advance") workflow.advance(required("--operator"));
else throw new Error(`unknown action ${action}`);
await store.save(workflow.state);

function json<T>(): T { const raw = required("--json"); return JSON.parse(raw) as T; }
function required(name: string): string { const result = value(name); if (!result) throw new Error(`${name} is required`); return result; }
function skillFor(phase: ActivePhase): string { return ({ GRILLING: "grill-me", SPECIFYING: "to-spec", SLICING: "to-tickets", IMPLEMENTING: "implement", REVIEWING: "code-review" })[phase]; }
