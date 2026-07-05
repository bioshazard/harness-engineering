import assert from "node:assert/strict";
import test from "node:test";
import { selectFiles } from "../src/file-selection.js";

test("consumer selects matching TypeScript sources through stable seam", () => {
  assert.deepEqual(
    selectFiles(
      ["src/index.ts", "src/index.js", "test/index.test.ts"],
      "src/**/*.ts",
    ),
    ["src/index.ts"],
  );
});
