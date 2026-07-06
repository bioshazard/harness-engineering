import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
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
        run("bun", ["run", "typecheck"], workspace),
        run("bun", ["test"], workspace),
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

type InstalledPackage = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
};

async function installedPackages(workspace: string) {
  const root = join(workspace, "node_modules");
  const packages = new Map<string, InstalledPackage>();
  async function visit(directory: string) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".bin") continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        await visit(path);
        continue;
      }
      try {
        const manifest = JSON.parse(
          await readFile(join(path, "package.json"), "utf8"),
        ) as InstalledPackage;
        if (manifest.name) packages.set(manifest.name, manifest);
      } catch {
        // Ignore non-package directories in node_modules.
      }
    }
  }
  await visit(root);
  return packages;
}

function hasInstallScript(pkg: InstalledPackage | undefined) {
  return ["preinstall", "install", "postinstall"].some(
    (name) => pkg?.scripts?.[name] !== undefined,
  );
}

export function realUpgradeChild(artifactRoot: string): UpgradeChild {
  return {
    async run({ workspace }): Promise<UpgradeReceipt> {
      const beforeSnapshot = await snapshot(workspace);
      const beforeManifest = JSON.parse(
        await readFile(join(workspace, MANIFEST_PATH), "utf8"),
      ) as { dependencies?: Record<string, string> };
      const beforePackages = await installedPackages(workspace);
      const install = await run(
        "bun",
        ["add", "--exact", "--ignore-scripts", TARGET_DEPENDENCY],
        workspace,
      );
      const afterPackages = await installedPackages(workspace);
      const installed = JSON.parse(
        await readFile(
          join(workspace, "node_modules", "minimatch", "package.json"),
          "utf8",
        ),
      ) as { name: string; version: string };
      const added = [...afterPackages.keys()].filter(
        (name) => !beforePackages.has(name),
      );
      const removed = [...beforePackages.keys()].filter(
        (name) => !afterPackages.has(name),
      );
      const installScriptsAdded = [...afterPackages.keys()].filter(
        (name) =>
          hasInstallScript(afterPackages.get(name)) &&
          !hasInstallScript(beforePackages.get(name)),
      ).length;
      const artifacts = [
        await writeArtifact(artifactRoot, "bun-install.txt", install.output),
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
