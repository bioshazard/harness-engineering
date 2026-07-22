import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const pi = resolve("node_modules/.bin/pi");
process.stderr.write(`Live Pi exercise (uses existing OAuth):
1. /crust start <small multi-ticket idea>
2. Use each proposal popup to accept/reject shared-understanding, test-seams, spec, and tickets
3. Verify Pi replaces the shaping session after ticket selection
4. Drive review findings through FIXING, clean review, commit, acceptance
5. /crust next until /crust status reports DONE
Exit Pi to finish the exercise.
`);
const result = spawnSync(pi, [
  "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files",
  "--no-builtin-tools", "--extension", ".pi/extensions/crust.ts",
], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
