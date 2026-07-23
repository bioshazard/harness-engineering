import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWishGardenMcpServer } from "../src/lib/mcp-server";
import type { WorldConfig } from "../src/lib/world";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Codex MCP surface", () => {
  test("lists bounded tools, inspects state, and returns the captured view", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "wish-mcp-"));
    temporaryDirectories.push(directory);
    const worldPath = path.join(directory, "world.json");
    const viewPath = path.join(directory, "view.png");
    const world: WorldConfig = {
      revision: 1,
      name: "MCP Garden",
      palette: {
        sky: "#000000",
        fog: "#000000",
        ground: "#000000",
        groundEdge: "#000000",
        accent: "#ffffff",
        glow: "#ffffff",
      },
      population: { motes: 1, stones: 1, lanterns: 1 },
      economy: { sparks: 1, collectedMotes: [] },
      entities: [
        {
          id: "test-seed",
          kind: "wish-seed",
          label: "Test seed",
          position: { x: 0, z: 0 },
          scale: 1,
          tint: "#ffffff",
        },
      ],
      history: { past: [], future: [] },
    };
    await writeFile(worldPath, JSON.stringify(world));
    await writeFile(
      viewPath,
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    const server = createWishGardenMcpServer({ worldPath, viewPath });
    const client = new Client({ name: "wish-garden-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.server.connect(serverTransport),
    ]);

    const tools = await client.listTools();
    const inspected = await client.callTool({
      name: "inspect_entity",
      arguments: { id: "test-seed" },
    });
    const captured = await client.callTool({
      name: "capture_game_view",
      arguments: {},
    });

    expect(tools.tools.map((tool) => tool.name)).toHaveLength(8);
    expect(JSON.stringify(inspected.content)).toContain("test-seed");
    expect(JSON.stringify(captured.content)).toContain('"type":"image"');
    expect(JSON.stringify(captured.content)).toContain('"mimeType":"image/png"');

    await client.close();
    await server.close();
  });
});
