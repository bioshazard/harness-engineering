import { growEntity } from "@/lib/world-store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const mutation = await growEntity(id);
    return Response.json({ entity: mutation.result, world: mutation.world });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to grow entity." },
      { status: 400 },
    );
  }
}
