import { readWorld } from "@/lib/world-store";

export async function GET() {
  return Response.json(await readWorld(), {
    headers: { "Cache-Control": "no-store" },
  });
}
