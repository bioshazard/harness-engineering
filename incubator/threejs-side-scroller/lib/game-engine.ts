import type { ArtifactSpec } from "./artifact";

export const WORLD_END = 46;
export const PLAYER_SIZE = 1.15;
export const FLOOR_Y = -2.7;
export const GAP_START = 8;
export const GAP_END = 14;
export const GAP_CENTER = (GAP_START + GAP_END) / 2;

const GRAVITY = 25;
const LAUNCH_SPEED_X = 7.2;
const RESET_Y = -9;

export type ArtifactMechanic =
  | {
      kind: "support";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "propel";
      x: number;
      width: number;
      force: number;
    };

export function compileArtifactMechanic(
  spec: ArtifactSpec,
): ArtifactMechanic {
  if (spec.affordance.kind === "support") {
    return {
      kind: "support",
      x: GAP_CENTER,
      y: Number((FLOOR_Y + 0.15).toFixed(2)),
      width: spec.affordance.span,
      height: 0.4,
    };
  }
  return {
    kind: "propel",
    x: GAP_START - 0.85,
    width: 1.8,
    force: spec.affordance.force,
  };
}

export function artifactCanClearGap(spec: ArtifactSpec): boolean {
  const mechanic = compileArtifactMechanic(spec);
  if (mechanic.kind === "support") {
    return (
      mechanic.x - mechanic.width / 2 <= GAP_START &&
      mechanic.x + mechanic.width / 2 >= GAP_END
    );
  }

  const crossingTime = (GAP_END - mechanic.x) / LAUNCH_SPEED_X;
  const launchY = FLOOR_Y + PLAYER_SIZE / 2;
  const yAtFarEdge =
    launchY +
    mechanic.force * crossingTime -
    (GRAVITY * crossingTime ** 2) / 2;
  return yAtFarEdge > RESET_Y;
}
