import { Type, type Static } from "typebox";

const Vector3Schema = Type.Tuple([
  Type.Number({ minimum: -6, maximum: 6 }),
  Type.Number({ minimum: -3, maximum: 3 }),
  Type.Number({ minimum: -2, maximum: 2 }),
]);

const ScaleSchema = Type.Tuple([
  Type.Number({ minimum: 0.12, maximum: 8 }),
  Type.Number({ minimum: 0.12, maximum: 3 }),
  Type.Number({ minimum: 0.12, maximum: 3 }),
]);

export const ArtifactSpecSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 40 }),
    description: Type.String({ minLength: 1, maxLength: 180 }),
    affordance: Type.Union([
      Type.Object({
        kind: Type.Literal("support"),
        span: Type.Number({ minimum: 4, maximum: 8 }),
      }),
      Type.Object({
        kind: Type.Literal("propel"),
        force: Type.Number({ minimum: 9, maximum: 15 }),
      }),
      Type.Object({
        kind: Type.Literal("connect"),
        span: Type.Number({ minimum: 4, maximum: 8 }),
      }),
    ]),
    parts: Type.Array(
      Type.Object({
        primitive: Type.Union([
          Type.Literal("box"),
          Type.Literal("sphere"),
          Type.Literal("cylinder"),
          Type.Literal("cone"),
          Type.Literal("torus"),
        ]),
        position: Vector3Schema,
        scale: ScaleSchema,
        rotation: Vector3Schema,
        color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
      }),
      { minItems: 1, maxItems: 10 },
    ),
  },
  { additionalProperties: false },
);

export type ArtifactSpec = Static<typeof ArtifactSpecSchema>;

export type ForgedArtifact = {
  id: string;
  model: string;
  prompt: string;
  spec: ArtifactSpec;
};

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): string {
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new Error(`${label} length must be ${minimum}-${maximum}`);
  }
  return trimmed;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
}

export function validateArtifactSpec(input: unknown): ArtifactSpec {
  if (!input || typeof input !== "object") throw new Error("artifact must be an object");
  const value = input as Record<string, unknown>;
  assertOnlyKeys(value, ["name", "description", "affordance", "parts"], "artifact");
  const name = boundedString(value.name, 1, 40, "name");
  const description = boundedString(value.description, 1, 180, "description");

  if (!value.affordance || typeof value.affordance !== "object") {
    throw new Error("affordance must be an object");
  }
  const rawAffordance = value.affordance as Record<string, unknown>;
  let affordance: ArtifactSpec["affordance"];
  if (rawAffordance.kind === "support" || rawAffordance.kind === "connect") {
    assertOnlyKeys(rawAffordance, ["kind", "span"], "affordance");
    affordance = {
      kind: rawAffordance.kind,
      span: boundedNumber(rawAffordance.span, 4, 8, "affordance.span"),
    };
  } else if (rawAffordance.kind === "propel") {
    assertOnlyKeys(rawAffordance, ["kind", "force"], "affordance");
    affordance = {
      kind: "propel",
      force: boundedNumber(rawAffordance.force, 9, 15, "affordance.force"),
    };
  } else {
    throw new Error("affordance.kind must be support, propel, or connect");
  }

  if (!Array.isArray(value.parts) || value.parts.length < 1 || value.parts.length > 10) {
    throw new Error("parts must contain 1-10 items");
  }
  const primitives = new Set(["box", "sphere", "cylinder", "cone", "torus"]);
  const parts: ArtifactSpec["parts"] = value.parts.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`parts[${index}] must be an object`);
    }
    const part = candidate as Record<string, unknown>;
    assertOnlyKeys(
      part,
      ["primitive", "position", "scale", "rotation", "color"],
      `parts[${index}]`,
    );
    if (typeof part.primitive !== "string" || !primitives.has(part.primitive)) {
      throw new Error(`parts[${index}].primitive is invalid`);
    }
    if (!Array.isArray(part.position) || part.position.length !== 3) {
      throw new Error(`parts[${index}].position must have 3 values`);
    }
    if (!Array.isArray(part.scale) || part.scale.length !== 3) {
      throw new Error(`parts[${index}].scale must have 3 values`);
    }
    if (!Array.isArray(part.rotation) || part.rotation.length !== 3) {
      throw new Error(`parts[${index}].rotation must have 3 values`);
    }
    if (typeof part.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(part.color)) {
      throw new Error(`parts[${index}].color must be #RRGGBB`);
    }
    return {
      primitive: part.primitive as ArtifactSpec["parts"][number]["primitive"],
      position: part.position.map((entry, axis) =>
        boundedNumber(entry, axis === 0 ? -6 : axis === 1 ? -3 : -2, axis === 0 ? 6 : axis === 1 ? 3 : 2, `parts[${index}].position[${axis}]`),
      ) as [number, number, number],
      scale: part.scale.map((entry, axis) =>
        boundedNumber(entry, 0.12, axis === 0 ? 8 : 3, `parts[${index}].scale[${axis}]`),
      ) as [number, number, number],
      rotation: part.rotation.map((entry, axis) =>
        boundedNumber(entry, axis === 2 ? -2 : -6, axis === 2 ? 2 : 6, `parts[${index}].rotation[${axis}]`),
      ) as [number, number, number],
      color: part.color,
    };
  });

  return { name, description, affordance, parts };
}
