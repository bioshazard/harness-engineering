export const CATEGORIES = [
  "workflow",
  "prompts",
  "model",
  "capabilities",
  "policy",
  "evaluators",
  "runtime",
  "schemas",
  "telemetry",
  "artifacts",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type Selector =
  | { type: "exact"; id: string; digest?: string }
  | { type: "local"; path: string }
  | { type: "phoenix-prompt"; name: string; tag?: string; versionId?: string }
  | { type: "none" };

export type ComponentDeclaration = {
  name: string;
  provider: string;
  contract: string;
  selector: Selector;
};

export type CompositionManifest = {
  schemaVersion: 1;
  name: string;
  profile: string;
  components: Record<Category, ComponentDeclaration[]>;
};

export type ManifestVersion = {
  id: string;
  manifest: CompositionManifest;
};

export type ResolvedComponent = {
  category: Category;
  name: string;
  provider: string;
  contract: string;
  immutableId: string;
  digest: string;
  source: Json;
};

export type CompositionLock = {
  schemaVersion: 1;
  manifestVersionId: string;
  manifestName: string;
  profile: string;
  components: ResolvedComponent[];
};

export type StoredLock = {
  compositionId: string;
  lock: CompositionLock;
};

export type ResolutionFailure = {
  kind: "resolution_failure";
  manifestVersionId: string;
  failures: Array<{
    category: Category;
    name: string;
    code: string;
    message: string;
  }>;
};

export type TerminalVerdict = "accept" | "reject";

export type WorkflowResult<T extends Json = Json> = {
  terminalVerdict: TerminalVerdict;
  domain: T;
  authorityDecisions?: Json[];
  evaluatorIdentities?: string[];
  artifacts?: Array<{ name: string; sha256: string; path?: string }>;
};

export type Receipt<T extends Json = Json> = {
  schemaVersion: 1;
  id: string;
  runId: string;
  compositionId: string;
  manifestVersionId: string;
  traceId: string;
  terminalVerdict: TerminalVerdict;
  components: Array<{
    category: Category;
    name: string;
    immutableId: string;
    digest: string;
  }>;
  evaluatorIdentities: string[];
  authorityDecisions: Json[];
  artifacts: Array<{ name: string; sha256: string; path?: string }>;
  domain: T;
};

export type Transition = {
  <T>(
    transitionId: string,
    componentNames: string[],
    run: () => Promise<T>,
  ): Promise<T>;
};

export type LockedContext = {
  runId: string;
  compositionId: string;
  traceId: string;
  components: ReadonlyArray<ResolvedComponent>;
  prompt(name: string): ResolvedComponent;
  annotate(attributes: Record<string, string | number | boolean>): void;
  event(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void;
  transition: Transition;
};

export type Workflow<TIntent = Json, TDomain extends Json = Json> = {
  source: string;
  run(context: LockedContext, intent: TIntent): Promise<WorkflowResult<TDomain>>;
};

export type Telemetry = {
  run<T>(
    input: {
      runId: string;
      compositionId: string;
      manifestVersionId: string;
      components: ResolvedComponent[];
    },
    execute: (
      traceId: string,
      transition: Transition,
      annotate: LockedContext["annotate"],
      event: LockedContext["event"],
    ) => Promise<T>,
  ): Promise<T>;
};

export type ComposeInput<TIntent, TDomain extends Json> = {
  name: string;
  workflow: Workflow<TIntent, TDomain>;
  prompt?: ComponentDeclaration | ComponentDeclaration[];
  profile?: Partial<Record<Category, ComponentDeclaration[]>>;
  rootDir?: string;
  registryDir?: string;
  telemetry?: Telemetry;
};
