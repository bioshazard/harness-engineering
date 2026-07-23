import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpRequest } from "../src/devbox/server.js";
import { discoverRemoteTools } from "../src/factory/mcp-tools.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());

describe("dev-box MCP boundary", () => {
  test("discovers Pi names and executes in the dev-box workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-devbox-"));
    const server = Bun.serve({
      port: 0,
      fetch: (request) => handleMcpRequest(request, root),
    });
    const client = new Client({ name: "test-factory", version: "0.1.0" });
    cleanup = async () => {
      await client.close();
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    };
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`)),
    );
    const tools = await discoverRemoteTools(client);
    expect(tools.map((tool) => tool.name).sort()).toEqual(["bash", "edit", "read", "write"]);

    const write = tools.find((tool) => tool.name === "write")!;
    await write.execute("write-1", { path: "hello.txt", content: "hello" });
    expect(await readFile(join(root, "hello.txt"), "utf8")).toBe("hello");

    const bash = tools.find((tool) => tool.name === "bash")!;
    const result = await bash.execute("bash-1", { command: "pwd" });
    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type !== "text") throw new Error("expected text");
    expect(await realpath(result.content[0].text.trim())).toBe(await realpath(root));
  });
});
