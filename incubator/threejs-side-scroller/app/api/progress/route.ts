import { recordProgress } from "../../../lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      progress?: unknown;
      completed?: unknown;
      artifactId?: unknown;
    };
    if (
      typeof body.progress !== "number" ||
      !Number.isInteger(body.progress) ||
      body.progress < 0 ||
      body.progress > 100 ||
      typeof body.completed !== "boolean" ||
      (body.artifactId !== undefined &&
        (typeof body.artifactId !== "string" ||
          !/^[a-f0-9]{20}$/.test(body.artifactId)))
    ) {
      return Response.json({ error: "invalid progress record" }, { status: 400 });
    }
    await recordProgress({
      progress: body.progress,
      completed: body.completed,
      artifactId: body.artifactId,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("progress persistence failed", error);
    return Response.json({ error: "progress persistence failed" }, { status: 500 });
  }
}
