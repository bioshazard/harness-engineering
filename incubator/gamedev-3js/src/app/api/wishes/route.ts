import {
  acceptWishProposal,
  createWishProposal,
} from "@/lib/wish-loop";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { description?: string };
    return Response.json({
      proposal: await createWishProposal(String(body.description ?? "")),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to preview wish." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { id?: string };
    return Response.json(await acceptWishProposal(String(body.id ?? "")));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to accept wish." },
      { status: 400 },
    );
  }
}
