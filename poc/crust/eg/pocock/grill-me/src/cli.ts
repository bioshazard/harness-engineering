import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  ModelRegistry,
  SessionManager,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";

import { crustGrillingExtension } from "./pi-extension.js";
import { assertCompositionMatchesSkill, resolveGrillMeSkill, type ResolvedGrillMeSkill } from "./skill.js";
import { FileRunStore } from "./store.js";
import { GrillingWorkflow, type GrillingRun } from "./workflow.js";

const MODEL_PROVIDER = "openai-codex";
const MODEL_ID = "gpt-5.5";

function usage(): string {
  return "Usage: npm run crust:grill-me -- --idea <text> [--question <id:prompt>] [--skill <SKILL.md>] [--run-dir <path>] [--resume <run-id>]";
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function questions(values: string[]): GrillingRun["questions"] {
  return values.map((value, index) => {
    const separator = value.indexOf(":");
    const id = separator === -1 ? `question-${index + 1}` : value.slice(0, separator);
    const prompt = separator === -1 ? value : value.slice(separator + 1);
    if (!id || !prompt) throw new Error(`invalid --question ${value}; expected id:prompt`);
    return { id, prompt, required: true, status: "open" };
  });
}

function newRun(idea: string, questionValues: string[], skill: ResolvedGrillMeSkill): GrillingRun {
  const runId = `grill-${randomUUID()}`;
  const runQuestions = questions(questionValues.length > 0 ? questionValues : ["design:What material design decision must be resolved?"]);
  const contextId = createHash("sha256")
    .update(JSON.stringify({ idea, questions: runQuestions }))
    .digest("hex");
  return {
    id: runId,
    workflowRevision: "pocock-grill-me/v1",
    state: "GRILLING",
    intent: idea,
    composition: {
      skill: "grill-me",
      version: skill.version,
      source: skill.path,
      model: `${MODEL_PROVIDER}/${MODEL_ID}`,
      contextId: `sha256:${contextId}`,
    },
    questions: runQuestions,
    decisions: [],
    approvals: [],
    artifacts: [],
    events: [],
  };
}

const idea = arg("--idea");
const resume = arg("--resume");
const runDirectory = resolve(arg("--run-dir") ?? ".crust/runs");
const skillPath = resolve(arg("--skill") ?? join(homedir(), ".agents", "skills", "grill-me", "SKILL.md"));
const questionValues = process.argv.flatMap((value, index) => process.argv[index - 1] === "--question" ? [value] : []);

if (process.argv.includes("--help") || (!idea && !resume)) {
  console.log(usage());
  process.exit(0);
}

const store = new FileRunStore(runDirectory);
const skill = await resolveGrillMeSkill(skillPath);
const workflow = new GrillingWorkflow(resume ? await store.load(resume) : newRun(idea!, questionValues, skill));
if (resume) assertCompositionMatchesSkill(workflow.state.composition, skill);
if (!resume) await store.save(workflow.state);

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const model = modelRegistry.find(MODEL_PROVIDER, MODEL_ID);
if (!model) throw new Error(`Pi does not provide ${MODEL_PROVIDER}/${MODEL_ID}`);
if (!modelRegistry.isUsingOAuth(model)) {
  throw new Error("Codex subscription OAuth is not configured. Run `npx @earendil-works/pi-coding-agent`, use /login, choose OpenAI Codex, then retry.");
}

const cwd = process.cwd();
const agentDir = getAgentDir();
const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd: runtimeCwd, agentDir: runtimeAgentDir, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({
    cwd: runtimeCwd,
    agentDir: runtimeAgentDir,
    authStorage,
    modelRegistry,
    resourceLoaderOptions: {
      // Keep Pi's standard TUI/session stack, but lock this child to the Crust
      // extension rather than inheriting ambient skills or extensions.
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      appendSystemPrompt: [
        `<locked-skill name="${skill.name}" source="${skill.path}" version="${skill.version}">\n${skill.content}\n</locked-skill>`,
        "You are the bounded grill-me child of Pi Crust. The locked skill governs the interview. Crust governs authority: do not implement code or choose the next workflow state. When a branch is resolved, call propose_decision. The operator alone approves or rejects candidates through /crust.",
        workflow.contextProjection(),
      ],
      extensionFactories: [crustGrillingExtension(workflow, store)],
    },
  });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
      thinkingLevel: "medium",
      tools: ["read", "grep", "find", "ls", "propose_decision"],
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd,
  agentDir,
  sessionManager: SessionManager.create(cwd),
});
const tui = new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: runtime.modelFallbackMessage,
  initialMessage: "Begin the grilling session. Start with the highest-leverage unresolved question.",
  initialImages: [],
  initialMessages: [],
});
await tui.run();
