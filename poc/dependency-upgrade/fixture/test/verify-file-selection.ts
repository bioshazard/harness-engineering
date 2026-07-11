import assert from "node:assert/strict";
import { selectFiles } from "../src/file-selection.js";

assert.deepEqual(
  selectFiles(
    ["src/index.ts", "src/index.js", "test/index.test.ts"],
    "src/**/*.ts",
  ),
  ["src/index.ts"],
);
