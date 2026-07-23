import { importEntityAsset } from "../src/lib/catalog";

const [command, asset, id] = Bun.argv.slice(2);

if (command !== "import" || !asset) {
  console.error("Usage: bun run entity import <asset> [id]");
  process.exit(1);
}

try {
  const entry = await importEntityAsset(asset, { id });
  console.log(`Imported ${entry.id} as ${entry.asset}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to import asset.");
  process.exit(1);
}
