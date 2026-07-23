import { updateEntity } from "@/lib/world-store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const mutation = await updateEntity(id, body);
    return Response.json({ entity: mutation.result, world: mutation.world });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update entity." },
      { status: 400 },
    );
  }
}
