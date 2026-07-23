import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerPiBuiltins } from "./tools.js";

export function createMcpServer(root: string): McpServer {
  const server = new McpServer({ name: "pi-dev-box", version: "0.1.0" });
  registerPiBuiltins(server, root);
  return server;
}

export async function handleMcpRequest(request: Request, root: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/health") return new Response("ok");
  if (path !== "/mcp") {
    return new Response("not found", { status: 404 });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(root);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();
  return response;
}

if (import.meta.main) {
  const root = process.env.WORKSPACE_ROOT ?? "/workspace";
  const port = Number(process.env.PORT ?? "3000");
  Bun.serve({
    hostname: "0.0.0.0",
    port,
    fetch: (request) => handleMcpRequest(request, root),
  });
  console.error(`dev-box MCP listening on :${port}; workspace=${root}`);
}
