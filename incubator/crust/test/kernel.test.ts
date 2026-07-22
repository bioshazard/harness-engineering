import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { createCrustKernel } from "../src/kernel/kernel.js";
import { directoryHash } from "../src/kernel/objects.js";
import { PocockClient } from "../src/pocock/client.js";
import { CrustError, type ArtifactRef, type Run } from "../src/kernel/types.js";

const skillNames = ["grill-with-docs", "grilling", "domain-modeling", "to-spec", "codebase-design", "to-tickets", "implement", "tdd", "code-review"];

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "crust-test-"));
  const skills = join(root, "skills");
  for (const name of skillNames) {
    await mkdir(join(skills, name), { recursive: true });
    await writeFile(join(skills, name, "SKILL.md"), `# ${name}\nlocked`);
  }
  const lock = Object.fromEntries(await Promise.all(skillNames.map(async (name) => [name, await directoryHash(join(skills, name))])));
  const kernel = createCrustKernel({
    root: join(root, ".crust"),
    client: new PocockClient(),
    skills: { dir: skills, source: "mattpocock/skills", revision: "d574778f94cf620fcc8ce741584093bc650a61d3", lock },
    runtime: { provider: "openai-codex", model: "gpt-5.4", thinking: "high" },
  });
  return { kernel, root, lock };
}

async function artifact(child: ReturnType<Awaited<ReturnType<typeof harness>>["kernel"]["child"]>, text: string): Promise<ArtifactRef> {
  return child.stageArtifact(text, "text/markdown");
}

async function accept(run: Run, kernel: Awaited<ReturnType<typeof harness>>["kernel"], session: string, payload: unknown): Promise<Run> {
  const proposal = await kernel.child(run.id, session).propose(run.revision, payload);
  return kernel.operator(run.id).accept(proposal.revision, proposal.proposals.at(-1)!.id);
}
const ticket = (id: string, title: string, blockedBy: string[] = []) => ({ id, title, whatToBuild: `Build ${title}`, acceptanceCriteria: [`${title} works`], blockedBy });

describe("public kernel/client seam", () => {
  it("drives a multi-ticket canonical spine with shaping and ticket session boundaries", async () => {
    const { kernel } = await harness();
    let run = await kernel.createRun({ idea: "ship durable crust", sessionId: "shape" });
    expect(run.state).toBe("GRILLING");

    run = await accept(run, kernel, "shape", { decisions: ["SQLite is authoritative"], glossary: ["run"], adrs: ["ADR-1"] });
    expect(run.state).toBe("SPECIFYING");
    expect(kernel.projection(run.id, "shape")).toMatchObject({ glossary: ["run"], adrs: ["ADR-1"] });
    run = await accept(run, kernel, "shape", { seams: ["kernel/client public interface"] });
    expect(run.state).toBe("SPECIFYING");
    const spec = await artifact(kernel.child(run.id, "shape"), "# Spec");
    run = await accept(run, kernel, "shape", { artifact: spec });
    expect(run.state).toBe("SLICING");
    run = await accept(run, kernel, "shape", { tickets: [
      ticket("a", "Tracer A"),
      ticket("b", "Tracer B", ["a"]),
    ] });
    expect(run.state).toBe("SLICING");
    expect(run.sessions).toHaveLength(1);

    run = kernel.operator(run.id).startTicket(run.revision, "a");
    expect(() => kernel.child(run.id, "shape")).toThrowError(CrustError);
    run = kernel.operator(run.id).restoreSession(run.revision, "ticket-a");
    const ticketPrompt = await kernel.lockedPrompt(run.id, "ticket-a");
    expect(ticketPrompt).toContain("# Spec");
    expect(ticketPrompt).toContain("Build Tracer A");
    expect(ticketPrompt).toContain("Tracer A works");
    expect(ticketPrompt).not.toContain("Build Tracer B");
    const implementation = await artifact(kernel.child(run.id, "ticket-a"), "diff");
    const tests = await artifact(kernel.child(run.id, "ticket-a"), "tests pass");
    const types = await artifact(kernel.child(run.id, "ticket-a"), "types pass");
    run = await accept(run, kernel, "ticket-a", { implementation, tests, typecheck: types });
    expect(run.state).toBe("REVIEWING");
    expect(kernel.activeTools(run.id)).toContain("run_review_axes");
    expect(kernel.activeTools(run.id)).not.toContain("write");
    await expect(kernel.child(run.id, "ticket-a").propose(run.revision, { standardsFindings: ["fix naming"], specificationFindings: [] })).rejects.toThrow(/report/i);
    run = await kernel.child(run.id, "ticket-a").recordReviewReports(run.revision, "standards report", "specification report");
    run = await accept(run, kernel, "ticket-a", { standardsFindings: ["fix naming"], specificationFindings: [] });
    expect(run.state).toBe("FIXING");
    run = await accept(run, kernel, "ticket-a", { implementation, tests, typecheck: types });
    expect(run.reviewReports).toBeUndefined();
    run = await kernel.child(run.id, "ticket-a").recordReviewReports(run.revision, "clean standards", "clean specification");
    run = await accept(run, kernel, "ticket-a", { standardsFindings: [], specificationFindings: [] });
    expect(run.state).toBe("COMMITTING");
    run = await accept(run, kernel, "ticket-a", { commit: "a".repeat(40) });
    expect(run.state).toBe("ACCEPTED");

    run = kernel.operator(run.id).startTicket(run.revision, "b");
    run = kernel.operator(run.id).restoreSession(run.revision, "ticket-b");
    expect(kernel.projection(run.id, "ticket-b").activeTicket?.id).toBe("b");
    expect(kernel.projection(run.id, "ticket-b")).not.toHaveProperty("receipts");
    const childB = kernel.child(run.id, "ticket-b");
    const implB = await artifact(childB, "diff b");
    const testB = await artifact(childB, "tests b");
    const typeB = await artifact(childB, "types b");
    run = await accept(run, kernel, "ticket-b", { implementation: implB, tests: testB, typecheck: typeB });
    run = await kernel.child(run.id, "ticket-b").recordReviewReports(run.revision, "standards b", "specification b");
    run = await accept(run, kernel, "ticket-b", { standardsFindings: [], specificationFindings: [] });
    run = await accept(run, kernel, "ticket-b", { commit: "b".repeat(40) });
    run = kernel.operator(run.id).finish(run.revision);
    expect(run.state).toBe("DONE");
    expect(new Set(run.sessions.map((session) => session.sessionId))).toEqual(new Set(["shape", "ticket-a", "ticket-b"]));
  });

  it("separates authority, rejects stale CAS, invalidates changed evidence, and preserves snapshots", async () => {
    const { kernel, root, lock } = await harness();
    let run = await kernel.createRun({ idea: "authority", sessionId: "shape" });
    const captured = kernel.child(run.id, "shape");
    const child = captured as unknown as Record<string, unknown>;
    expect(child.accept).toBeUndefined();
    run = kernel.operator(run.id).resumeSession(run.revision, "replacement");
    await expect(captured.propose(run.revision, { decisions: ["forged"], glossary: [], adrs: [] })).rejects.toThrow(/session/i);
    const proposed = await kernel.child(run.id, "replacement").propose(run.revision, { decisions: ["one"], glossary: [], adrs: [] });
    const proposalId = proposed.proposals.at(-1)!.id;
    run = await kernel.operator(run.id).recordEvidence(proposed.revision, "changed");
    expect(() => kernel.operator(run.id).accept(run.revision, proposalId)).toThrowError(/evidence/i);

    const current = kernel.run(run.id);
    const first = kernel.operator(run.id).reject(current.revision, proposalId, "stale");
    await expect(kernel.operator(run.id).recordEvidence(current.revision, "loser")).rejects.toThrow(/revision/i);
    expect(first.state).toBe("GRILLING");

    const lockedBefore = await kernel.lockedPrompt(run.id, "replacement");
    await writeFile(join(root, "skills", "grilling", "SKILL.md"), "changed upstream");
    expect(kernel.verifyResume(run.id).composition.objectHash).toBe(run.composition.objectHash);
    expect(await kernel.lockedPrompt(run.id, "replacement")).toBe(lockedBefore);
    expect(() => kernel.verifyResume(run.id, { model: "drift" })).toThrowError(/composition/i);
    const upgraded = createCrustKernel({
      root: join(root, ".crust"), client: new PocockClient(),
      skills: { dir: join(root, "skills"), source: "mattpocock/skills", revision: "future-dependency-revision", lock },
      runtime: { provider: "openai-codex", model: "gpt-5.4", thinking: "high" },
    });
    expect(upgraded.verifyResume(run.id).composition.revision).toBe("d574778f94cf620fcc8ce741584093bc650a61d3");
    expect(await upgraded.lockedPrompt(run.id, "replacement")).toBe(lockedBefore);
    await expect(upgraded.createRun({ idea: "must reject corrupt install", sessionId: "new" })).rejects.toThrow(/lock metadata/i);
    upgraded.close();
  });

  it("rejects illegal proposals, cyclic tickets, illegal frontier choices, and tampered objects", async () => {
    const { kernel, root } = await harness();
    let run = await kernel.createRun({ idea: "guards", sessionId: "shape" });
    expect(() => kernel.child(run.id, "wrong")).toThrowError(/session/i);
    await expect(kernel.child(run.id, "shape").propose(run.revision, { artifact: { hash: "x" } })).rejects.toThrow(/decisions/i);
    run = await accept(run, kernel, "shape", { decisions: ["ok"], glossary: [], adrs: [] });
    run = await accept(run, kernel, "shape", { seams: ["public seam"] });
    const spec = await kernel.child(run.id, "shape").stageArtifact("spec", "text/markdown");
    run = await accept(run, kernel, "shape", { artifact: spec });
    await expect(kernel.child(run.id, "shape").propose(run.revision, { tickets: [{ id: "thin", title: "thin", blockedBy: [] }] })).rejects.toThrow(/whatToBuild/i);
    await expect(kernel.child(run.id, "shape").propose(run.revision, { tickets: [
      ticket("a", "a", ["b"]), ticket("b", "b", ["a"]),
    ] })).rejects.toThrow(/acyclic/i);
    run = await accept(run, kernel, "shape", { tickets: [ticket("a", "a"), ticket("b", "b", ["a"])] });
    expect(() => kernel.operator(run.id).startTicket(run.revision, "b")).toThrow(/ready/i);

    const objectPath = join(root, ".crust", "objects", spec.hash.slice(0, 2), spec.hash.slice(2));
    await chmod(objectPath, 0o644);
    await writeFile(objectPath, "tampered");
    await expect(kernel.readArtifact(spec)).rejects.toThrow(/verification/i);
  });
});
