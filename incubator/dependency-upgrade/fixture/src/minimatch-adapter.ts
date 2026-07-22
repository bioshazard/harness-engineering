import minimatch from "minimatch";

export function matchesSelection(path: string, pattern: string): boolean {
  return minimatch(path, pattern);
}
