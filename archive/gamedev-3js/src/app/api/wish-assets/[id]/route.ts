import { readWishAsset } from "@/lib/wish-loop";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return new Response(await readWishAsset(id), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return new Response("Wish asset not found.", { status: 404 });
  }
}
