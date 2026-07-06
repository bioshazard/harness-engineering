export const ADAPTER_PATH = "src/minimatch-adapter.ts";
export const MANIFEST_PATH = "package.json";
export const LOCKFILE_PATH = "bun.lock";
export const TARGET_DEPENDENCY = "minimatch@9.0.9";

export type Verdict = "pass" | "fail";
export type Diagnostic = {
  file: string;
  code: string;
  message: string;
};
export type Artifact = { name: string; path: string; sha256: string };

export type VerifyReceipt = {
  kind: "verify";
  id: string;
  verdict: Verdict;
  typecheck: Verdict;
  tests: Verdict;
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
};
export type UpgradeReceipt = {
  kind: "upgrade";
  id: string;
  verdict: Verdict;
  before: string;
  after: string;
  changedFiles: string[];
  dependencyDelta: {
    added: number;
    removed: number;
    installScriptsAdded: number;
  };
  artifacts: Artifact[];
};
export type Proposal = { path: string; content: string };
export type AuthorityDecision =
  | { verdict: "allow"; path: string }
  | { verdict: "block"; path: string; reason: string };
export type RemediateReceipt = {
  kind: "remediate";
  id: string;
  verdict: Verdict;
  proposal: Proposal;
  authority: AuthorityDecision;
  effect: "replaced" | "not_run";
  executor: { provider: string; model: string };
  artifacts: Artifact[];
};
export type ChildReceipt =
  | VerifyReceipt
  | UpgradeReceipt
  | RemediateReceipt;

export type VerifyChild = {
  run(input: { workspace: string; label: string }): Promise<VerifyReceipt>;
};
export type UpgradeChild = {
  run(input: { workspace: string }): Promise<UpgradeReceipt>;
};
export type RemediateChild = {
  run(input: {
    workspace: string;
    intent: string;
    diagnostics: Diagnostic[];
  }): Promise<RemediateReceipt>;
};

export type Phase =
  | "verify_baseline"
  | "upgrade"
  | "verify_candidate"
  | "authorize_remediation"
  | "reverify"
  | "accept"
  | "reject";
export type Reaction =
  | "upgrade"
  | "verify_candidate"
  | "authorize_remediation"
  | "reverify"
  | "accept"
  | "reject";
export type Transition = {
  phase: Phase;
  childReceiptId?: string;
  observation: string;
  reaction: Reaction;
};
export type ParentReceipt = {
  intent: {
    dependency: typeof TARGET_DEPENDENCY;
    fixture: string;
    allowedMutations: string[];
  };
  transitions: Transition[];
  childReceipts: ChildReceipt[];
  authorityDecisions: AuthorityDecision[];
  terminalVerdict: "accept" | "reject";
  reason: string;
  changedFiles: string[];
  terminalObservation: {
    declaredDependency: string | null;
    installedDependency: string | null;
    changedFiles: string[];
    withinAllowedMutations: boolean;
  };
  artifacts: Artifact[];
  executor?: { provider: string; model: string };
  runtime: { bun: string };
};
