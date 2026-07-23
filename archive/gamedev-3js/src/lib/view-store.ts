import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const currentViewPath = path.join(
  process.cwd(),
  "data",
  "current-view.png",
);

export async function writeCurrentView(
  bytes: Uint8Array,
  filePath = currentViewPath,
) {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error("Game view must be a PNG.");
  }
  if (bytes.length > 8_000_000) throw new Error("Game view is too large.");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

export async function readCurrentView(filePath = currentViewPath) {
  return readFile(filePath);
}
