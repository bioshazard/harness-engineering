import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readCurrentView } from "./view-store";
import {
  placeCatalogEntity,
  plantWishSeed,
  readWorld,
  updateEntity,
} from "./world-store";

type Options = {
  worldPath?: string;
  viewPath?: string;
};

type RegisterTool = <T extends Record<string, z.ZodTypeAny>>(
  name: string,
  config: {
    description: string;
    inputSchema?: T;
  },
  handler: (
    args: { [K in keyof T]: z.infer<T[K]> },
  ) => Promise<CallToolResult>,
) => void;

function textResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Wish Garden tool failed.",
      },
    ],
  };
}

export function createWishGardenMcpServer(options: Options = {}) {
  const server = new McpServer({
    name: "wish-garden",
    version: "0.1.0",
  });
  const registerTool = server.registerTool.bind(server) as unknown as RegisterTool;
  const worldOptions = options.worldPath
    ? { filePath: options.worldPath }
    : undefined;

  registerTool(
    "list_entities",
    { description: "List inspectable Wish Garden entities." },
    async () => {
      const world = await readWorld(options.worldPath);
      return textResult(
        world.entities.map(({ id, kind, label, position }) => ({
          id,
          kind,
          label,
          position,
        })),
      );
    },
  );

  registerTool(
    "inspect_entity",
    {
      description: "Inspect one Wish Garden entity by stable id.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const world = await readWorld(options.worldPath);
      const entity = world.entities.find((candidate) => candidate.id === id);
      return entity
        ? textResult(entity)
        : toolError(new Error(`Unknown entity: ${id}`));
    },
  );

  registerTool(
    "read_game_state",
    { description: "Read current deterministic Wish Garden state." },
    async () => textResult(await readWorld(options.worldPath)),
  );

  registerTool(
    "place_entity",
    {
      description: "Place a registered entity type inside the garden.",
      inputSchema: {
        assetId: z.string().min(1),
        x: z.number().finite(),
        z: z.number().finite(),
      },
    },
    async ({ assetId, x, z }) => {
      try {
        const mutation =
          assetId === "wish-seed"
            ? await plantWishSeed({ x, z }, worldOptions)
            : await placeCatalogEntity({ x, z }, assetId, worldOptions);
        return textResult(mutation);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerTool(
    "move_entity",
    {
      description: "Move an entity inside the bounded garden.",
      inputSchema: {
        id: z.string().min(1),
        x: z.number().finite(),
        z: z.number().finite(),
      },
    },
    async ({ id, x, z }) => {
      try {
        return textResult(
          await updateEntity(id, { position: { x, z } }, worldOptions),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerTool(
    "scale_entity",
    {
      description: "Scale an entity from 0.25 through 4.",
      inputSchema: {
        id: z.string().min(1),
        scale: z.number().min(0.25).max(4),
      },
    },
    async ({ id, scale }) => {
      try {
        return textResult(await updateEntity(id, { scale }, worldOptions));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerTool(
    "recolor_entity",
    {
      description: "Tint an entity with a six-digit hex color.",
      inputSchema: {
        id: z.string().min(1),
        tint: z.string().regex(/^#[0-9a-f]{6}$/i),
      },
    },
    async ({ id, tint }) => {
      try {
        return textResult(await updateEntity(id, { tint }, worldOptions));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerTool(
    "capture_game_view",
    { description: "Return the latest PNG captured by the live game tab." },
    async () => {
      try {
        const image = await readCurrentView(options.viewPath);
        return {
          content: [
            {
              type: "image" as const,
              data: image.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
