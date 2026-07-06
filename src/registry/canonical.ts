import canonicalize from "canonicalize";
import { createHash } from "node:crypto";
import type { Json } from "./types.js";

export function canonical(value: Json): string {
  const encoded = canonicalize(value);
  if (encoded === undefined) throw new Error("value is not canonical JSON");
  return encoded;
}

export function digest(value: Json | string | Buffer): string {
  const bytes =
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : canonical(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
