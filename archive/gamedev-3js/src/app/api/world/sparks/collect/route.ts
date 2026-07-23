import { collectSpark } from "@/lib/world-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { moteIndex?: number };
    const mutation = await collectSpark(Number(body.moteIndex));
    return Response.json({
      collected: mutation.result,
      world: mutation.world,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to collect spark." },
      { status: 400 },
    );
  }
}
