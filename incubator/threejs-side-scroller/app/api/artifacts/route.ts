import { listArtifacts } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ artifacts: await listArtifacts() });
  } catch (error) {
    console.error("artifact replay listing failed", error);
    return Response.json(
      { error: "Saved artifacts are unavailable." },
      { status: 500 },
    );
  }
}
