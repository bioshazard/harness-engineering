import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_OUTPUT_BYTES = 50 * 1024;

function workspacePath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Path leaves dev-box workspace: ${path}`);
  }
  return absolute;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

function tail(text: string): string {
  const bytes = Buffer.byteLength(text);
  if (bytes <= MAX_OUTPUT_BYTES) return text;
  const suffix = Buffer.from(text).subarray(bytes - MAX_OUTPUT_BYTES).toString();
  return `[truncated to last ${MAX_OUTPUT_BYTES} bytes]\n${suffix}`;
}

export function registerPiBuiltins(server: McpServer, root: string): void {
  server.registerTool(
    "read",
    {
      description: "Read a text file in the dev-box workspace.",
      inputSchema: {
        path: z.string().describe("Path to the file to read (relative or absolute)"),
        offset: z.number().optional().describe("Line number to start reading from (1-indexed)"),
        limit: z.number().optional().describe("Maximum number of lines to read"),
      },
    },
    async ({ path, offset, limit }) => {
      try {
        const text = await readFile(workspacePath(root, path), "utf8");
        const lines = text.split("\n");
        const start = Math.max(0, (offset ?? 1) - 1);
        return textResult(lines.slice(start, limit === undefined ? undefined : start + limit).join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "write",
    {
      description: "Write complete text contents to a file in the dev-box workspace.",
      inputSchema: {
        path: z.string().describe("Path to the file to write (relative or absolute)"),
        content: z.string().describe("Content to write to the file"),
      },
    },
    async ({ path, content }) => {
      try {
        const target = workspacePath(root, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
        return textResult(`Successfully wrote ${Buffer.byteLength(content)} bytes to ${path}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "edit",
    {
      description: "Edit one text file using exact, unique replacements.",
      inputSchema: {
        path: z.string().describe("Path to the file to edit (relative or absolute)"),
        edits: z
          .array(
            z.object({
              oldText: z.string().describe("Exact unique text to replace"),
              newText: z.string().describe("Replacement text"),
            }),
          )
          .min(1)
          .describe("One or more non-overlapping replacements"),
      },
    },
    async ({ path, edits }) => {
      try {
        const target = workspacePath(root, path);
        const original = await readFile(target, "utf8");
        const ranges = edits.map(({ oldText, newText }) => {
          const start = original.indexOf(oldText);
          if (start < 0) throw new Error(`oldText was not found in ${path}`);
          if (original.indexOf(oldText, start + 1) >= 0) {
            throw new Error(`oldText is not unique in ${path}`);
          }
          return { start, end: start + oldText.length, newText };
        });
        ranges.sort((a, b) => b.start - a.start);
        for (let index = 1; index < ranges.length; index += 1) {
          if (ranges[index - 1]!.start < ranges[index]!.end) {
            throw new Error(`edits overlap in ${path}`);
          }
        }
        let updated = original;
        for (const edit of ranges) {
          updated = `${updated.slice(0, edit.start)}${edit.newText}${updated.slice(edit.end)}`;
        }
        await writeFile(target, updated, "utf8");
        return textResult(`Successfully replaced ${edits.length} block(s) in ${path}.`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "bash",
    {
      description: "Execute a Bash command in the dev-box workspace.",
      inputSchema: {
        command: z.string().describe("Bash command to execute"),
        timeout: z.number().positive().optional().describe("Timeout in seconds (optional, no default timeout)"),
      },
    },
    async ({ command, timeout }) => {
      const process = Bun.spawn(["bash", "-lc", command], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer =
        timeout === undefined
          ? undefined
          : setTimeout(() => process.kill(), timeout * 1000);
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
          process.exited,
        ]);
        const output = tail(`${stdout}${stderr}`) || "(no output)";
        return exitCode === 0
          ? textResult(output)
          : { ...textResult(`${output}\n\nCommand exited with code ${exitCode}`), isError: true };
      } catch (error) {
        return errorResult(error);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  );
}
