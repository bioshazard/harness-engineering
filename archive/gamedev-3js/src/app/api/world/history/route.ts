import { redoWorld, undoWorld } from "@/lib/world-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: "undo" | "redo" };
    const world =
      body.action === "undo"
        ? await undoWorld()
        : body.action === "redo"
          ? await redoWorld()
          : (() => {
              throw new Error("History action must be undo or redo.");
            })();
    return Response.json({ world });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to change history." },
      { status: 400 },
    );
  }
}
