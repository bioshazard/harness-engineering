import type { EntityKind, WorldConfig, WorldEntity } from "../src/lib/world";

const worldPath = new URL("../public/world.json", import.meta.url);
const world = (await Bun.file(worldPath).json()) as WorldConfig;
const [command = "show", ...args] = Bun.argv.slice(2);

const presets: Record<string, Pick<WorldConfig, "name" | "palette">> = {
  clearing: {
    name: "The First Clearing",
    palette: {
      sky: "#141a33",
      fog: "#31395d",
      ground: "#506164",
      groundEdge: "#252d3b",
      accent: "#a8f0c6",
      glow: "#ffbd7a",
    },
  },
  moonrise: {
    name: "Moonmilk Hollow",
    palette: {
      sky: "#080b20",
      fog: "#26284b",
      ground: "#38495b",
      groundEdge: "#171a32",
      accent: "#8be4ff",
      glow: "#d6b0ff",
    },
  },
  ember: {
    name: "The Ember Orchard",
    palette: {
      sky: "#28151e",
      fog: "#654043",
      ground: "#5c5948",
      groundEdge: "#33282b",
      accent: "#f8d98f",
      glow: "#ff8b5f",
    },
  },
};

function usage() {
  console.log(`Wish Garden world controls

  bun run world show
  bun run world list
  bun run world inspect <id>
  bun run world add <wish-seed|moon-tree> <id> <x> <z>
  bun run world move <id> <x> <z>
  bun run world scale <id> <0.25-4>
  bun run world recolor <id> <#rrggbb>
  bun run world preset <clearing|moonrise|ember>
  bun run world motes <0-30>
  bun run world lanterns <0-12>
  bun run world name <words...>`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function findEntity(id: string | undefined) {
  const entity = world.entities.find((candidate) => candidate.id === id);
  if (!entity) fail(`Unknown entity "${id ?? ""}". Run "bun run world list".`);
  return entity;
}

function parseCoordinate(raw: string | undefined, axis: "x" | "z") {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < -7.5 || value > 7.5) {
    fail(`${axis} must be a number from -7.5 to 7.5.`);
  }
  return value;
}

function validateId(id: string | undefined) {
  if (!id || !/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
    fail("id must be 2-32 lowercase letters, numbers, or hyphens, starting with a letter.");
  }
  return id;
}

function validateTint(tint: string | undefined) {
  if (!tint || !/^#[0-9a-f]{6}$/i.test(tint)) {
    fail("tint must be a six-digit hex color such as #b9ddff.");
  }
  return tint.toLowerCase();
}

if (command === "show") {
  console.log(JSON.stringify(world, null, 2));
  process.exit(0);
}

if (command === "list") {
  console.table(
    world.entities.map(({ id, kind, position, scale, tint }) => ({
      id,
      kind,
      x: position.x,
      z: position.z,
      scale,
      tint,
    })),
  );
  process.exit(0);
}

if (command === "inspect") {
  console.log(JSON.stringify(findEntity(args[0]), null, 2));
  process.exit(0);
}

if (command === "preset") {
  const preset = presets[args[0]];
  if (!preset) {
    usage();
    process.exit(1);
  }
  world.name = preset.name;
  world.palette = preset.palette;
} else if (command === "motes" || command === "lanterns") {
  const value = Number(args[0]);
  const max = command === "motes" ? 30 : 12;
  if (!Number.isInteger(value) || value < 0 || value > max) {
    fail(`${command} must be an integer from 0 to ${max}.`);
  }
  world.population[command] = value;
} else if (command === "name") {
  const name = args.join(" ").trim();
  if (!name) fail("name needs at least one word.");
  world.name = name;
} else if (command === "add") {
  const [kind, rawId, rawX, rawZ] = args;
  if (kind !== "wish-seed" && kind !== "moon-tree") {
    fail("kind must be wish-seed or moon-tree.");
  }
  const id = validateId(rawId);
  if (world.entities.some((entity) => entity.id === id)) fail(`Entity "${id}" already exists.`);
  const entity: WorldEntity = {
    id,
    kind: kind as EntityKind,
    label: kind === "moon-tree" ? "Moon tree" : "Wish seed",
    position: { x: parseCoordinate(rawX, "x"), z: parseCoordinate(rawZ, "z") },
    scale: 1,
    tint: "#ffffff",
  };
  world.entities.push(entity);
} else if (command === "move") {
  const entity = findEntity(args[0]);
  entity.position = {
    x: parseCoordinate(args[1], "x"),
    z: parseCoordinate(args[2], "z"),
  };
} else if (command === "scale") {
  const entity = findEntity(args[0]);
  const scale = Number(args[1]);
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 4) {
    fail("scale must be a number from 0.25 to 4.");
  }
  entity.scale = scale;
} else if (command === "recolor") {
  findEntity(args[0]).tint = validateTint(args[1]);
} else {
  usage();
  process.exit(1);
}

world.revision += 1;
await Bun.write(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`world revision ${world.revision}: ${world.name}`);
