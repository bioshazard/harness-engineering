export type EntityKind = "wish-seed" | "moon-tree";

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
  entities: WorldEntity[];
};
