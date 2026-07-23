import { writeCurrentView } from "@/lib/view-store";

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type") !== "image/png") {
      throw new Error("Game view must use image/png.");
    }
    await writeCurrentView(new Uint8Array(await request.arrayBuffer()));
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save game view." },
      { status: 400 },
    );
  }
}
