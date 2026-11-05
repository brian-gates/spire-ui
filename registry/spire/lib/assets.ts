import { fallbackKeyFor, type FallbackKey } from "../icons/fallback-keys";

export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
}
export type Resolved =
  | { source: "extracted"; src: string; name: string; description?: string; w: number; h: number }
  | { source: "fallback"; fallback: FallbackKey; name: string };

const KINDS: Record<string, AssetKind> = {
  CHARACTER: "class", ROOM: "room", RELIC: "relic", POTION: "potion", CARD: "card",
};

export function kindOf(id: string): AssetKind {
  const dot = id.indexOf(".");
  return (dot > 0 && KINDS[id.slice(0, dot)]) || "ui";
}

const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

export function tidyId(id: string): string {
  const body = id.slice(id.indexOf(".") + 1);
  return body
    .split("_")
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      return i > 0 && SMALL.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function resolveAsset(id: string, manifest: SpireManifest | null, base: string): Resolved {
  const item = manifest?.items[id];
  if (!item) return { source: "fallback", fallback: fallbackKeyFor(id), name: tidyId(id) };
  return {
    source: "extracted",
    src: `${base.replace(/\/+$/, "")}/${item.file}`,
    name: item.name ?? tidyId(id),
    description: item.description,
    w: item.w,
    h: item.h,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseManifest(json: unknown): SpireManifest | null {
  if (!isObj(json) || json.schemaVersion !== 1 || !isObj(json.items)) return null;
  for (const item of Object.values(json.items)) {
    if (!isObj(item) || typeof item.file !== "string" || typeof item.w !== "number" || typeof item.h !== "number") return null;
  }
  return json as unknown as SpireManifest;
}
