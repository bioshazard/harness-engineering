export type EntityKind = "wish-seed" | "moon-tree" | "catalog" | "creature";
export type GrowthStage = "seed" | "sprout" | "mature";

export type EntityType = {
  id: string;
  label: string;
  kind: EntityKind;
  asset: string;
  defaultScale: number;
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
};
