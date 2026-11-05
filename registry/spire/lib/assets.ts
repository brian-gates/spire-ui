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

const PREFIX_KINDS = new Map<string, AssetKind>([
  ["CHARACTER", "class"], ["ROOM", "room"], ["RELIC", "relic"], ["POTION", "potion"], ["CARD", "card"],
]);
const ASSET_KINDS: ReadonlySet<string> = new Set<AssetKind>(["relic", "potion", "card", "class", "room", "ui"]);

export function kindOf(id: string): AssetKind {
  const dot = id.indexOf(".");
  return (dot > 0 && PREFIX_KINDS.get(id.slice(0, dot))) || "ui";
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
  const item = manifest && Object.hasOwn(manifest.items, id) ? manifest.items[id] : undefined;
  if (!item) return { source: "fallback", fallback: fallbackKeyFor(id), name: tidyId(id) };
  return {
    source: "extracted",
    src: `${base.replace(/\/+$/, "")}/${item.file.replace(/^\/+/, "")}`,
    name: item.name ?? tidyId(id),
    description: item.description,
    w: item.w,
    h: item.h,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseManifest(json: unknown): SpireManifest | null {
  if (!isObj(json) || json.schemaVersion !== 1 || !isObj(json.items)) return null;
  const items: Record<string, ManifestItem> = Object.create(null);
  for (const [id, item] of Object.entries(json.items)) {
    if (!isObj(item) || typeof item.file !== "string" || typeof item.w !== "number" || typeof item.h !== "number") return null;
    if (typeof item.kind !== "string" || !ASSET_KINDS.has(item.kind)) continue; // unknown kind: drop the item, it falls back
    const clean = { ...item } as unknown as ManifestItem;
    if (typeof item.name !== "string") delete clean.name;
    if (typeof item.description !== "string") delete clean.description;
    items[id] = clean;
  }
  return { ...(json as unknown as SpireManifest), items };
}
