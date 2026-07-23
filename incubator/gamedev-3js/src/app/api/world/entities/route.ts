import { plantWishSeed } from "@/lib/world-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { x?: number; z?: number };
    const mutation = await plantWishSeed({ x: Number(body.x), z: Number(body.z) });
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
