import { placeCatalogEntity, plantWishSeed } from "@/lib/world-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      x?: number;
      z?: number;
      assetId?: string;
    };
    const position = { x: Number(body.x), z: Number(body.z) };
    const mutation =
      !body.assetId || body.assetId === "wish-seed"
        ? await plantWishSeed(position)
        : await placeCatalogEntity(position, body.assetId);
    return Response.json(
      { entity: mutation.result, world: mutation.world },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to plant seed." },
      { status: 400 },
    );
  }
}
