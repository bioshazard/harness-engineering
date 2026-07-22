import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { AuthStorage, createAgentSessionFromServices, createAgentSessionRuntime, createAgentSessionServices, getAgentDir, InteractiveMode, ModelRegistry, SessionManager, type CreateAgentSessionRuntimeFactory } from "@earendil-works/pi-coding-agent";

import { assertCompositionMatchesSkill, resolveSkill, type ResolvedSkill } from "../../../../lib/skill.js";
import { FileRunStore } from "../../../../lib/store.js";
import { crustPocockExtension } from "./pi-extension.js";
import { ACTIVE_PHASES, PocockWorkflow, type ActivePhase, type PocockRun } from "./workflow.js";

const PROVIDER = "openai-codex";
const MODEL = "gpt-5.5";
const args = process.argv.slice(2);
const arg = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const runDirectory = resolve(arg("--run-dir") ?? ".crust/runs");
const resume = arg("--resume");

if (args.includes("--help") || (!arg("--idea") && !resume)) {
  console.log("Usage: bun run crust:pocock -- --idea <text> [--question id:prompt] [--run-dir path] [--resume run-id] [--grilling-skill path] …");
  process.exit(0);
}

const store = new FileRunStore<PocockRun>(runDirectory);
const stored = resume ? await store.load(resume) : undefined;
const lockedSkills = stored ? await resolveLockedSkills(stored) : await resolveAllSkills();
const workflow = new PocockWorkflow(stored ?? PocockWorkflow.create({
  id: `pocock-${randomUUID()}`,
  intent: arg("--idea")!,
  compositions: Object.fromEntries(ACTIVE_PHASES.map((phase) => {
    const skill = lockedSkills[phase];
    return [phase, { skill: skill.name, version: skill.version, source: skill.path, model: `${PROVIDER}/${MODEL}` }];
  })) as PocockRun["compositions"],
}));
for (const phase of ACTIVE_PHASES) assertCompositionMatchesSkill(workflow.state.compositions[phase], lockedSkills[phase]);
if (!resume) await store.save(workflow.state);
const phase = workflow.state.phase;
if (phase === "DONE") { console.log(`Crust ${workflow.state.id} is DONE.`); process.exit(0); }

const skill = lockedSkills[phase];
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const model = modelRegistry.find(PROVIDER, MODEL);
if (!model) throw new Error(`Pi does not provide ${PROVIDER}/${MODEL}`);
if (!modelRegistry.isUsingOAuth(model)) throw new Error("Codex subscription OAuth is not configured. Run Pi, choose /login → OpenAI Codex, then retry.");

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({
    cwd, agentDir, authStorage, modelRegistry,
    resourceLoaderOptions: {
      noExtensions: true, noSkills: true, noPromptTemplates: true,
      appendSystemPrompt: [
        `<locked-skill name="${skill.name}" source="${skill.path}" version="${skill.version}">\n${skill.content}\n</locked-skill>`,
        phaseInstruction(phase), workflow.contextProjection(),
      ],
      extensionFactories: [crustPocockExtension(workflow, store)],
    },
  });
  return { ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model, thinkingLevel: "medium", tools: ["read", "grep", "find", "ls", "propose_decision", "propose_phase_outcome", "stage_phase_artifact"] })), services, diagnostics: services.diagnostics };
};
const cwd = process.cwd();
const runtime = await createAgentSessionRuntime(createRuntime, { cwd, agentDir: getAgentDir(), sessionManager: SessionManager.create(cwd) });
const tui = new InteractiveMode(runtime, { migratedProviders: [], modelFallbackMessage: runtime.modelFallbackMessage, initialMessage: initialMessage(phase), initialImages: [], initialMessages: [] });
await tui.run();

async function resolveAllSkills(): Promise<Record<ActivePhase, ResolvedSkill>> {
  return Object.fromEntries(await Promise.all(ACTIVE_PHASES.map(async (phase) => {
    const name = skillFor(phase); const path = resolve(arg(`--${phase.toLowerCase()}-skill`) ?? join(homedir(), ".agents", "skills", name, "SKILL.md"));
    return [phase, await resolveSkill(path, name)];
  }))) as Record<ActivePhase, ResolvedSkill>;
}
async function resolveLockedSkills(run: PocockRun): Promise<Record<ActivePhase, ResolvedSkill>> {
  return Object.fromEntries(await Promise.all(ACTIVE_PHASES.map(async (phase) => {
    const lock = run.compositions[phase];
    return [phase, await resolveSkill(lock.source, lock.skill)];
  }))) as Record<ActivePhase, ResolvedSkill>;
}
function skillFor(phase: ActivePhase): string { return ({ GRILLING: "grill-me", SPECIFYING: "to-spec", SLICING: "to-tickets", IMPLEMENTING: "implement", REVIEWING: "code-review" })[phase]; }
function initialMessage(phase: ActivePhase): string { return phase === "GRILLING" ? "Begin the grilling session. Ask one high-leverage unresolved question at a time; do not rush to a decision." : `Begin ${phase}. Work only under the locked skill and propose the phase outcome when it is ready.`; }
function phaseInstruction(phase: ActivePhase): string { return `You are the bounded ${phase} Pi Crust child. The locked skill governs your work. Crust owns all authority: never claim a transition occurred. You may stage one or more phase-local intermediate artifacts through stage_phase_artifact; this records custody only, not semantic approval. Propose only the phase outcome through the Crust tool, then ask the operator to approve it. ${phase === "GRILLING" ? "This is a many-turn interview: ask one question at a time and continue until the required decisions are settled." : ""}`; }
