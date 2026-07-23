export type EntityKind = "wish-seed" | "moon-tree" | "catalog" | "creature";
export type GrowthStage = "seed" | "sprout" | "mature";
export type WishMotion =
  | "wander"
  | "follow-player"
  | "orbit-tree"
  | "hunt-lanterns";

export type EntityType = {
  id: string;
  label: string;
  kind: EntityKind;
  asset: string;
  defaultScale: number;
};

export type WorldSnapshot = Pick<
  WorldConfig,
  "name" | "palette" | "population" | "economy" | "entities"
>;

export type WorldMutation = {
  id: string;
  timestamp: string;
  action: string;
  before: WorldSnapshot;
  after: WorldSnapshot;
};

export type WorldEntity = {
  id: string;
  kind: EntityKind;
  label: string;
  position: {
    x: number;
    z: number;
  };
  scale: number;
  tint: string;
  asset?: string;
  growth?: {
    stage: GrowthStage;
    plantedAt: string;
    stageStartedAt: string;
  };
  creature?: {
    state: "wander" | "follow" | "feed";
    targetId?: string;
    energy: number;
  };
  behavior?: {
    motion?: WishMotion;
    speed?: number;
    kind?: string;
    summary: string;
    state?: string;
  };
};

export type WorldConfig = {
  revision: number;
  name: string;
  palette: {
    sky: string;
    fog: string;
    ground: string;
    groundEdge: string;
    accent: string;
    glow: string;
  };
  population: {
    motes: number;
    stones: number;
    lanterns: number;
  };
  economy: {
    sparks: number;
    collectedMotes: number[];
  };
  entities: WorldEntity[];
  history: {
    past: WorldMutation[];
    future: WorldMutation[];
  };
};
