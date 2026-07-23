import { validateArtifactSpec } from "../../../lib/artifact";
import { forgeInHarnessProcess } from "../../../lib/forge-process";
import { saveArtifact } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body.prompt !== "string") {
      return Response.json({ error: "prompt must be text" }, { status: 400 });
    }
    const prompt = body.prompt.trim();
    if (prompt.length < 3 || prompt.length > 300) {
      return Response.json(
        { error: "prompt length must be 3-300 characters" },
        { status: 400 },
      );
    }

    const proposal = await forgeInHarnessProcess(prompt);
    const artifact = await saveArtifact({
      prompt,
      model: proposal.model,
      spec: validateArtifactSpec(proposal.spec),
    });
    return Response.json({ artifact });
  } catch (error) {
    console.error("artifact forge failed", error);
    return Response.json(
      { error: "Pi could not forge an artifact. Try a different description." },
      { status: 500 },
    );
  }
}
