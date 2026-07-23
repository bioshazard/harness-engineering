import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WishMotion } from "./world";
import { introduceEntity } from "./world-store";

export type WishBehavior = {
  motion: WishMotion;
  speed: number;
  summary: string;
};

export type WishWorkerResult = {
  label: string;
  behavior: WishBehavior;
  model: string;
};

export type WishWorker = (input: {
  description: string;
  imagePath: string;
}) => Promise<WishWorkerResult>;

export type WishProposal = {
  id: string;
  description: string;
  label: string;
  asset: string;
  behavior: WishBehavior;
  model: string;
  createdAt: string;
  acceptedAt?: string;
};

export const wishDataDirectory = path.join(process.cwd(), "data");
export const wishProposalPath = path.join(
  wishDataDirectory,
  "wish-proposal.json",
);
export const wishAssetsDirectory = path.join(wishDataDirectory, "assets");

async function writeProposal(proposal: WishProposal, filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(proposal, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function validateWorkerResult(value: WishWorkerResult) {
  if (!value.label.trim() || value.label.length > 60) {
    throw new Error("Wish label must be 1-60 characters.");
  }
  if (
    !["wander", "follow-player", "orbit-tree", "hunt-lanterns"].includes(
      value.behavior.motion,
    )
  ) {
    throw new Error("Wish motion is outside the bounded behavior set.");
  }
  if (
    !Number.isFinite(value.behavior.speed) ||
    value.behavior.speed < 0.2 ||
    value.behavior.speed > 1.2
  ) {
    throw new Error("Wish speed must be between 0.2 and 1.2.");
  }
  if (
    !value.behavior.summary.trim() ||
    value.behavior.summary.length > 120
  ) {
    throw new Error("Wish behavior summary must be 1-120 characters.");
  }
  if (!value.model.trim()) throw new Error("Wish worker model is required.");
}

async function assertPng(filePath: string) {
  const file = await stat(filePath);
  if (file.size > 8_000_000) throw new Error("Generated wish image is too large.");
  const header = new Uint8Array(await readFile(filePath)).slice(0, 8);
  if (
    header.length < 8 ||
    header[0] !== 0x89 ||
    header[1] !== 0x50 ||
    header[2] !== 0x4e ||
    header[3] !== 0x47
  ) {
    throw new Error("Wish worker must produce a PNG.");
  }
}

export async function createWishProposal(
  description: string,
  options: {
    filePath?: string;
    assetsDirectory?: string;
    createId?: () => string;
    now?: () => Date;
    worker?: WishWorker;
  } = {},
) {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 120) {
    throw new Error("Wish description must be 3-120 characters.");
  }
  const id = options.createId?.() ?? randomUUID();
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid wish proposal id.");
  const assetsDirectory = options.assetsDirectory ?? wishAssetsDirectory;
  const imagePath = path.join(assetsDirectory, `${id}.png`);
  await mkdir(assetsDirectory, { recursive: true });
  const worker =
    options.worker ??
    (await import("./pi-wish-worker")).runPiWishWorker;
  const fulfillment = await worker({ description: normalized, imagePath });
  validateWorkerResult(fulfillment);
  await assertPng(imagePath);
  const proposal: WishProposal = {
    id,
    description: normalized,
    label: fulfillment.label.trim(),
    asset: `/api/wish-assets/${id}`,
    behavior: fulfillment.behavior,
    model: fulfillment.model,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  await writeProposal(proposal, options.filePath ?? wishProposalPath);
  return proposal;
}

export async function readWishProposal(filePath = wishProposalPath) {
  return JSON.parse(await readFile(filePath, "utf8")) as WishProposal;
}

export async function readWishAsset(
  id: string,
  assetsDirectory = wishAssetsDirectory,
) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid wish asset id.");
  return readFile(path.join(assetsDirectory, `${id}.png`));
}

export async function rejectWishProposal(
  id: string,
  options: { proposalPath?: string; assetsDirectory?: string } = {},
) {
  const proposalPath = options.proposalPath ?? wishProposalPath;
  const proposal = await readWishProposal(proposalPath);
  if (proposal.id !== id) throw new Error("Wish proposal is stale.");
  await Promise.all([
    rm(proposalPath, { force: true }),
    rm(
      path.join(options.assetsDirectory ?? wishAssetsDirectory, `${id}.png`),
      { force: true },
    ),
  ]);
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
