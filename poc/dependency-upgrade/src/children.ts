import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ADAPTER_PATH,
  LOCKFILE_PATH,
  MANIFEST_PATH,
  TARGET_DEPENDENCY,
  type Diagnostic,
  type UpgradeChild,
  type UpgradeReceipt,
  type VerifyChild,
  type VerifyReceipt,
} from "./contracts.js";
import { receiptId, writeArtifact } from "./evidence.js";
import { changedFiles, snapshot } from "./workspace.js";

const execFileAsync = promisify(execFile);

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: "1" },
    });
    return { ok: true, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}${failure.message}`,
    };
  }
}

function diagnostics(output: string, workspace: string): Diagnostic[] {
  const escaped = workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:${escaped}[/\\\\])?([^\\n(]+\\.ts)\\(\\d+,\\d+\\): error (TS\\d+): ([^\\n]+)`,
    "g",
  );
  return [...output.matchAll(pattern)].map((match) => ({
    file: match[1]!.replaceAll("\\", "/"),
    code: match[2]!,
    message: match[3]!,
  }));
}

export function realVerifyChild(artifactRoot: string): VerifyChild {
  return {
    async run({ workspace, label }): Promise<VerifyReceipt> {
      const [typecheck, tests] = await Promise.all([
        run("npm", ["run", "--silent", "typecheck"], workspace),
        run("npm", ["test", "--", "--test-reporter=spec"], workspace),
      ]);
      const artifacts = [
        await writeArtifact(
          artifactRoot,
          `${label}-typecheck.txt`,
          typecheck.output,
        ),
        await writeArtifact(
          artifactRoot,
          `${label}-tests.txt`,
          tests.output,
        ),
      ];
      const partial = {
        kind: "verify" as const,
        verdict: typecheck.ok && tests.ok ? ("pass" as const) : ("fail" as const),
        typecheck: typecheck.ok ? ("pass" as const) : ("fail" as const),
        tests: tests.ok ? ("pass" as const) : ("fail" as const),
        diagnostics: diagnostics(typecheck.output, workspace),
        artifacts,
      };
      return { ...partial, id: receiptId(partial) };
    },
  };
}

type Lockfile = {
  packages?: Record<string, { hasInstallScript?: boolean }>;
};

function packageSet(lock: Lockfile) {
  return new Set(Object.keys(lock.packages ?? {}).filter(Boolean));
}

export function realUpgradeChild(artifactRoot: string): UpgradeChild {
  return {
    async run({ workspace }): Promise<UpgradeReceipt> {
      const beforeSnapshot = await snapshot(workspace);
      const beforeManifest = JSON.parse(
        await readFile(join(workspace, MANIFEST_PATH), "utf8"),
      ) as { dependencies?: Record<string, string> };
      const beforeLock = JSON.parse(
        await readFile(join(workspace, LOCKFILE_PATH), "utf8"),
      ) as Lockfile;
      const install = await run(
        "npm",
        ["install", "--ignore-scripts", "--save-exact", TARGET_DEPENDENCY],
        workspace,
      );
      const afterLock = JSON.parse(
        await readFile(join(workspace, LOCKFILE_PATH), "utf8"),
      ) as Lockfile;
      const installed = JSON.parse(
        await readFile(
          join(workspace, "node_modules", "minimatch", "package.json"),
          "utf8",
        ),
      ) as { name: string; version: string };
      const beforePackages = packageSet(beforeLock);
      const afterPackages = packageSet(afterLock);
      const added = [...afterPackages].filter(
        (name) => !beforePackages.has(name),
      );
      const removed = [...beforePackages].filter(
        (name) => !afterPackages.has(name),
      );
      const installScriptsAdded = [...afterPackages].filter(
        (name) =>
          afterLock.packages?.[name]?.hasInstallScript === true &&
          beforeLock.packages?.[name]?.hasInstallScript !== true,
      ).length;
      const artifacts = [
        await writeArtifact(artifactRoot, "npm-install.txt", install.output),
        await writeArtifact(
          artifactRoot,
          "dependency-delta.json",
          `${JSON.stringify({ added, removed, installScriptsAdded }, null, 2)}\n`,
        ),
      ];
      const partial = {
        kind: "upgrade" as const,
        verdict:
          install.ok &&
          installed.name === "minimatch" &&
          installed.version === "9.0.9"
            ? ("pass" as const)
            : ("fail" as const),
        before: `minimatch@${beforeManifest.dependencies?.minimatch ?? "missing"}`,
        after: `${installed.name}@${installed.version}`,
        changedFiles: changedFiles(
          beforeSnapshot,
          await snapshot(workspace),
        ),
        dependencyDelta: {
          added: added.length,
          removed: removed.length,
          installScriptsAdded,
        },
        artifacts,
      };
      return { ...partial, id: receiptId(partial) };
    },
  };
}

export function parseDiagnosticsForTest(output: string, workspace: string) {
  return diagnostics(output, workspace);
}

export const EXPECTED_MUTATIONS = [
  MANIFEST_PATH,
  LOCKFILE_PATH,
  ADAPTER_PATH,
];
