import { describe, expect, test } from "bun:test";
import { FactoryMachine } from "../src/factory/machine.js";

describe("factory build stage", () => {
  test("records a successful proposal", async () => {
    const machine = new FactoryMachine(async (input) => ({ output: input.toUpperCase(), model: "fake" }));
    expect(await machine.build("build it")).toEqual({
      stage: "succeeded",
      input: "build it",
      result: { output: "BUILD IT", model: "fake" },
    });
  });

  test("contains worker failure as factory state", async () => {
    const machine = new FactoryMachine(async () => {
      throw new Error("dev box disappeared");
    });
    expect(await machine.build("build it")).toEqual({
      stage: "failed",
      input: "build it",
      error: "dev box disappeared",
    });
  });
});
