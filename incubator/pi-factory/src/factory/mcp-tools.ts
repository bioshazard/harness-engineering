import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { TSchema } from "typebox";

const TOOL_CALL_TIMEOUT_MS = Number(process.env.TOOL_CALL_TIMEOUT_MS ?? "10000");

export type RemoteToolClient = Pick<Client, "listTools" | "callTool">;

function contentText(content: Array<Record<string, unknown>>): string {
  return content
    .map((item) => (item.type === "text" ? String(item.text) : JSON.stringify(item)))
    .join("\n");
}

export async function discoverRemoteTools(client: RemoteToolClient): Promise<AgentTool[]> {
  const { tools } = await client.listTools();
  return tools.map(
    (tool): AgentTool => ({
      name: tool.name,
      label: tool.title ?? tool.name,
      description: tool.description ?? `Remote dev-box tool: ${tool.name}`,
      parameters: tool.inputSchema as TSchema,
      async execute(_toolCallId, params, signal) {
        const result = await client.callTool(
          { name: tool.name, arguments: params as Record<string, unknown> },
          undefined,
          { signal, timeout: TOOL_CALL_TIMEOUT_MS, maxTotalTimeout: TOOL_CALL_TIMEOUT_MS },
        );
        const content = result.content as Array<Record<string, unknown>>;
        const text = contentText(content);
        if (result.isError) throw new Error(text || `${tool.name} failed`);
        return {
          content: [{ type: "text", text }],
          details: { execution: "remote", server: "dev-box" },
        };
      },
    }),
  );
}

export async function connectDevbox(url: string): Promise<{
  client: Client;
  tools: AgentTool[];
}> {
  const client = new Client({ name: "pi-factory", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return { client, tools: await discoverRemoteTools(client) };
}
