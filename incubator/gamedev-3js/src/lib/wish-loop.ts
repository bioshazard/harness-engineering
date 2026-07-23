import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { introduceEntity } from "./world-store";

export type WishProposal = {
  id: string;
  description: string;
  label: string;
  asset: string;
  behavior: {
    kind: string;
    summary: string;
  };
  createdAt: string;
  acceptedAt?: string;
};

export const wishProposalPath = path.join(
  process.cwd(),
  ".wish-garden",
  "wish-proposal.json",
);

async function writeProposal(proposal: WishProposal, filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(proposal, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

export async function createWishProposal(
  description: string,
  options: {
    filePath?: string;
    createId?: () => string;
    now?: () => Date;
  } = {},
) {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 120) {
    throw new Error("Wish description must be 3-120 characters.");
  }
  const isLanternFox = /fox/i.test(normalized) && /lantern/i.test(normalized);
  const proposal: WishProposal = {
    id: options.createId?.() ?? randomUUID(),
    description: normalized,
    label: isLanternFox ? "Lantern-eating moon fox" : "Moonlit wish creature",
    asset: isLanternFox ? "/moon-fox.png" : "/moon-moth.png",
    behavior: isLanternFox
      ? {
          kind: "lantern-eater",
          summary: "Hunts the nearest lantern and rests when none remain.",
        }
      : {
          kind: "tree-friend",
          summary: "Wanders between moon trees without changing world state.",
        },
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  await writeProposal(proposal, options.filePath ?? wishProposalPath);
  return proposal;
}

export async function readWishProposal(filePath = wishProposalPath) {
  return JSON.parse(await readFile(filePath, "utf8")) as WishProposal;
}

export async function acceptWishProposal(
  id: string,
  options: {
    proposalPath?: string;
    worldPath?: string;
    createEntityId?: () => string;
    now?: () => Date;
  } = {},
) {
  const proposalPath = options.proposalPath ?? wishProposalPath;
  const proposal = await readWishProposal(proposalPath);
  if (proposal.id !== id) throw new Error("Wish proposal is stale.");
  if (proposal.acceptedAt) throw new Error("Wish proposal was already accepted.");
  const entityId =
    options.createEntityId?.() ?? `wish-${randomUUID().slice(0, 8)}`;
  const mutation = await introduceEntity(
    {
      id: entityId,
      kind: "catalog",
      label: proposal.label,
      position: { x: -2, z: 3 },
      scale: 1,
      tint: "#ffffff",
      asset: proposal.asset,
      behavior: { ...proposal.behavior, state: "introduced" },
    },
    {
      filePath: options.worldPath,
      action: `Accepted wish ${entityId}`,
    },
  );
  const accepted = {
    ...proposal,
    acceptedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  await writeProposal(accepted, proposalPath);
  return { entity: mutation.result, world: mutation.world, proposal: accepted };
}
