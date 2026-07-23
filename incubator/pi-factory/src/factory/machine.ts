export type BuildResult = {
  output: string;
  model: string;
};

export type FactoryState =
  | { stage: "ready" }
  | { stage: "building"; input: string }
  | { stage: "succeeded"; input: string; result: BuildResult }
  | { stage: "failed"; input: string; error: string };

export type BuildWorker = (input: string) => Promise<BuildResult>;

export class FactoryMachine {
  state: FactoryState = { stage: "ready" };

  constructor(private readonly buildWorker: BuildWorker) {}

  async build(input: string): Promise<FactoryState> {
    if (this.state.stage !== "ready") {
      throw new Error(`build is invalid from ${this.state.stage}`);
    }
    this.state = { stage: "building", input };
    try {
      const result = await this.buildWorker(input);
      this.state = { stage: "succeeded", input, result };
    } catch (error) {
      this.state = {
        stage: "failed",
        input,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return this.state;
  }
}
