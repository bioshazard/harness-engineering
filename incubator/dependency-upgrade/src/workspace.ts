import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { sha256 } from "./evidence.js";

export type Snapshot = Map<string, string>;

async function files(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".artifacts") continue;
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      result.push(path);
    } else if (entry.isDirectory()) {
      result.push(...(await files(root, path)));
    } else if (entry.isFile()) {
      result.push(path);
    }
  }
  return result;
}

export async function snapshot(root: string): Promise<Snapshot> {
  const result = new Map<string, string>();
  for (const path of await files(root)) {
    const stat = await lstat(path);
    const key = relative(root, path).split(sep).join("/");
    result.set(
      key,
      stat.isSymbolicLink()
        ? "symlink"
        : sha256(await readFile(path)),
    );
  }
  return result;
}

export function changedFiles(before: Snapshot, after: Snapshot) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .sort();
}
