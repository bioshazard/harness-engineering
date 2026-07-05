import { matchesSelection } from "./minimatch-adapter.js";

export function selectFiles(files: readonly string[], pattern: string) {
  return files.filter((file) => matchesSelection(file, pattern));
}
