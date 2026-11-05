import { fallbackKeyFor, type FallbackKey } from "../icons/fallback-keys";

export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
/** One of a card's numbers. `computed`: the game recalculates it at runtime (base shown when known). */
export interface CardVar {
  base?: number; upgraded?: number; computed?: boolean;
}
/** A card's stats, read from the game's code. Fields that could not be read are left out and named in `unknown`. */
export interface CardStats {
  /** Energy cost; "X" for X-cost cards, null for unplayable ones. */
  cost: number | "X" | null; upgradedCost?: number; starCost?: number;
  type: string; rarity: string; target?: string; pool?: string; frame?: string;
  keywords?: string[]; upgradedKeywords?: string[];
  vars?: Record<string, CardVar>;
  description?: string; upgradedDescription?: string;
  unknown?: string[];
}
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
  /**
   * Pixel widths of every file for this item, ascending; each lives at `file` with `@<width>` in
   * place of the last one (the largest, which is `file`). Absent in manifests written before it existed.
   */
  widths?: number[];
  card?: CardStats;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
}
export type Resolved =
  | {
      source: "extracted";
      /** The largest file: the fallback for browsers without srcset, and what `w`/`h` describe. */
      src: string;
      /** Every size as `<url> <width>w`, ascending, when the manifest lists `widths`. */
      srcSet?: string;
      name: string; description?: string; w: number; h: number; card?: CardStats;
    }
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

/** Most entries `widths` may have (the CLI writes at most this many sizes). */
export const MAX_WIDTHS = 16;
const SIZED_FILE = /@(\d+)\.webp$/;

/** `widths` if it is 1 to MAX_WIDTHS ascending positive integers ending at the item's own width and file name; else undefined. */
function parseWidths(v: unknown, file: string, w: number): number[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_WIDTHS) return undefined;
  if (!v.every((n, i) => Number.isSafeInteger(n) && n > 0 && (i === 0 || n > v[i - 1]))) return undefined;
  const largest = v[v.length - 1] as number;
  return largest === w && SIZED_FILE.exec(file)?.[1] === String(largest) ? [...(v as number[])] : undefined;
}

export function resolveAsset(id: string, manifest: SpireManifest | null, base: string): Resolved {
  const item = manifest && Object.hasOwn(manifest.items, id) ? manifest.items[id] : undefined;
  if (!item) return { source: "fallback", fallback: fallbackKeyFor(id), name: tidyId(id) };
  const url = (file: string) => `${base.replace(/\/+$/, "")}/${file.replace(/^\/+/, "")}`;
  const src = url(item.file);
  // A manifest passed in directly skips parseManifest, so check `widths` here too. srcset splits
  // candidates on whitespace, so a URL containing any gets only `src`.
  const widths = /\s/.test(src) ? undefined : parseWidths(item.widths, item.file, item.w);
  return {
    source: "extracted",
    src,
    ...(widths ? { srcSet: widths.map((width) => `${url(item.file.replace(SIZED_FILE, `@${width}.webp`))} ${width}w`).join(", ") } : {}),
    name: item.name ?? tidyId(id),
    description: item.description,
    w: item.w,
    h: item.h,
    ...(item.card ? { card: item.card } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isStr) ? [...v] : undefined);

/** A manifest item's `card`, keeping only well-typed fields; null without a valid cost, type and rarity. */
function parseCardStats(v: unknown): CardStats | null {
  if (!isObj(v)) return null;
  const cost = v.cost === null || v.cost === "X" || isNum(v.cost) ? v.cost : undefined;
  if (cost === undefined || !isStr(v.type) || !isStr(v.rarity)) return null;
  const out: CardStats = { cost, type: v.type, rarity: v.rarity };
  if (isNum(v.upgradedCost)) out.upgradedCost = v.upgradedCost;
  if (isNum(v.starCost)) out.starCost = v.starCost;
  for (const k of ["target", "pool", "frame", "description", "upgradedDescription"] as const) if (isStr(v[k])) out[k] = v[k];
  for (const k of ["keywords", "upgradedKeywords", "unknown"] as const) {
    const list = strings(v[k]);
    if (list) out[k] = list;
  }
  if (isObj(v.vars)) {
    const vars: Record<string, CardVar> = Object.create(null);
    for (const [name, raw] of Object.entries(v.vars)) {
      if (!isObj(raw)) continue;
      const cv: CardVar = {};
      if (isNum(raw.base)) cv.base = raw.base;
      if (isNum(raw.upgraded)) cv.upgraded = raw.upgraded;
      if (typeof raw.computed === "boolean") cv.computed = raw.computed;
      vars[name] = cv;
    }
    out.vars = vars;
  }
  return out;
}

export function parseManifest(json: unknown): SpireManifest | null {
  if (!isObj(json) || json.schemaVersion !== 1 || !isObj(json.items)) return null;
  const items: Record<string, ManifestItem> = Object.create(null);
  for (const [id, item] of Object.entries(json.items)) {
    if (!isObj(item) || typeof item.file !== "string" || typeof item.w !== "number" || typeof item.h !== "number") return null;
    if (typeof item.kind !== "string" || !ASSET_KINDS.has(item.kind)) continue; // unknown kind: drop the item, it falls back
    const clean = { ...item } as unknown as ManifestItem;
    if (typeof item.name !== "string") delete clean.name;
    if (typeof item.description !== "string") delete clean.description;
    const widths = parseWidths(item.widths, item.file, item.w);
    if (widths) clean.widths = widths;
    else delete clean.widths; // missing or malformed: only `file` is used
    const card = item.card === undefined ? null : parseCardStats(item.card);
    if (card) clean.card = card;
    else delete clean.card;
    items[id] = clean;
  }
  return { ...(json as unknown as SpireManifest), items };
}
