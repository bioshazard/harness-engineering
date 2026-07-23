type WorldConfig = {
  revision: number;
  name: string;
  palette: Record<string, string>;
  population: Record<string, number>;
};

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
  bun run world preset <clearing|moonrise|ember>
  bun run world motes <0-30>
  bun run world lanterns <0-12>
  bun run world name <words...>`);
}

if (command === "show") {
  console.log(JSON.stringify(world, null, 2));
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
    console.error(`${command} must be an integer from 0 to ${max}.`);
    process.exit(1);
  }
  world.population[command] = value;
} else if (command === "name") {
  const name = args.join(" ").trim();
  if (!name) {
    console.error("name needs at least one word.");
    process.exit(1);
  }
  world.name = name;
} else {
  usage();
  process.exit(1);
}

world.revision += 1;
await Bun.write(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`world revision ${world.revision}: ${world.name}`);
