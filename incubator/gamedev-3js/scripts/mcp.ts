import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWishGardenMcpServer } from "../src/lib/mcp-server";

const server = createWishGardenMcpServer();
await server.connect(new StdioServerTransport());
