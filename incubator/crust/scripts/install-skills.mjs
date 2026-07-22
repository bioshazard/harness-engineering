import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(process.argv[2] ?? root);
const manifest = JSON.parse(readFileSync(resolve(root, "crust-skills.json"), "utf8"));
const external = target !== root;
const installRoot = external ? mkdtempSync(join(tmpdir(), "pi-crust-skills-")) : root;
const checkout = resolve(root, ".crust/dependencies/mattpocock-skills");
rmSync(checkout, { recursive: true, force: true });
mkdirSync(checkout, { recursive: true });
execFileSync("git", ["init", "--quiet"], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["remote", "add", "origin", manifest.source], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", manifest.revision], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: checkout, stdio: "inherit" });
const cli = resolve(root, "node_modules/.bin/skills");
try {
  execFileSync(cli, ["add", checkout, "--agent", "pi", "--skill", ...manifest.skills, "--copy", "--yes"], { cwd: installRoot, stdio: "inherit" });
  const generated = JSON.parse(readFileSync(resolve(installRoot, "skills-lock.json"), "utf8"));
  const lock = { version: generated.version, skills: {} };
  for (const name of manifest.skills) {
    const skill = generated.skills[name];
    if (!skill) throw new Error(`Installer omitted pinned skill ${name}`);
    lock.skills[name] = { ...skill, source: `${manifest.source}#${manifest.revision}`, sourceType: "git" };
    if (external) {
      const destination = resolve(target, ".pi/skills", name);
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(resolve(installRoot, ".pi/skills", name), destination, { recursive: true });
    }
  }
  const lockPath = external ? resolve(target, ".crust/skills-lock.json") : resolve(root, "skills-lock.json");
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
} finally {
  if (external) rmSync(installRoot, { recursive: true, force: true });
}
