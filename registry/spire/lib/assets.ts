import { fallbackKeyFor, type FallbackKey } from "../icons/fallback-keys";

export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
/** One of a card's numbers. `computed`: the game recalculates it at runtime (base shown when known). */
export interface CardVar {
  base?: number; upgraded?: number; computed?: boolean;
}
/** A run of card text: plain, a number the game colours ("upgraded" when the upgrade changed it), or a game colour tag. */
export interface CardTextRun {
  text: string; style?: "number" | "upgraded" | "gold" | "blue" | "purple";
}
/** A card's stats, read from the game's code. Fields that could not be read are left out and named in `unknown`. */
export interface CardStats {
  /** Energy cost; "X" for X-cost cards, null for unplayable ones. */
  cost: number | "X" | null; upgradedCost?: number; starCost?: number;
  type: string; rarity: string; target?: string; pool?: string; frame?: string;
  keywords?: string[]; upgradedKeywords?: string[];
  vars?: Record<string, CardVar>;
  description?: string; upgradedDescription?: string;
  /** The descriptions as styled runs, line breaks kept (`\n`). */
  descriptionRuns?: CardTextRun[]; upgradedDescriptionRuns?: CardTextRun[];
  unknown?: string[];
}
/**
 * A relic's or potion's stats, read from the game's code: its rarity (RelicRarity / PotionRarity
 * member name), the pool that lists it (e.g. "ironclad", "shared"), and its description with real
 * numbers. Fields that could not be read are left out and named in `unknown`.
 */
export interface ItemStats {
  rarity?: string; pool?: string;
  description?: string;
  /** The description as styled runs, line breaks kept (`\n`). */
  descriptionRuns?: CardTextRun[];
  unknown?: string[];
}
/** A nine-slice texture's border widths, in pixels of the item's largest file (`file`). */
export interface NineSlice {
  left: number; top: number; right: number; bottom: number;
}
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
  /**
   * Pixel widths of every file for this item, ascending; each lives at `file` with `@<width>` in
   * place of the last one (the largest, which is `file`). Absent in manifests written before it existed.
   */
  widths?: number[];
  card?: CardStats;
  relic?: ItemStats;
  potion?: ItemStats;
  /** For a nine-slice UI piece (UI.HOVER_TIP): the borders the game stretches it by. */
  slice?: NineSlice;
}
/** A box in the game's card scene, in its pixels from the frame's top left; `fontSize` for text. */
export interface CardLayoutBox {
  x: number; y: number; w: number; h: number; fontSize?: number;
}
/**
 * The game's card layout: frame size (300 x 422) and boxes by name (frame, portrait, portraitBorder,
 * banner, title, plaque, orb, star, text), read from its card scene alongside the UI.CARD_* pieces.
 */
export interface CardLayout {
  w: number; h: number; boxes: Record<string, CardLayoutBox>;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
  cardLayout?: CardLayout;
}
export type Resolved =
  | {
      source: "extracted";
      /** The largest file: the fallback for browsers without srcset, and what `w`/`h` describe. */
      src: string;
      /** Every size as `<url> <width>w`, ascending, when the manifest lists `widths`. */
      srcSet?: string;
      name: string; description?: string; w: number; h: number; card?: CardStats;
      relic?: ItemStats; potion?: ItemStats; slice?: NineSlice;
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
    ...(item.relic ? { relic: item.relic } : {}),
    ...(item.potion ? { potion: item.potion } : {}),
    ...(item.slice ? { slice: item.slice } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isStr) ? [...v] : undefined);

const RUN_STYLES: ReadonlySet<string> = new Set(["number", "upgraded", "gold", "blue", "purple"]);
/** Text runs if every entry is { text: string, style?: known style }; else undefined. Unknown styles become plain. */
function textRuns(v: unknown): CardTextRun[] | undefined {
  if (!Array.isArray(v) || !v.every((r) => isObj(r) && isStr(r.text))) return undefined;
  return (v as Record<string, unknown>[]).map((r) =>
    isStr(r.style) && RUN_STYLES.has(r.style) ? { text: r.text as string, style: r.style as CardTextRun["style"] } : { text: r.text as string },
  );
}

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
  for (const k of ["descriptionRuns", "upgradedDescriptionRuns"] as const) {
    const list = textRuns(v[k]);
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

/** A manifest item's `relic` / `potion`, keeping only well-typed fields; null when it is not an object. */
function parseItemStats(v: unknown): ItemStats | null {
  if (!isObj(v)) return null;
  const out: ItemStats = {};
  for (const k of ["rarity", "pool", "description"] as const) if (isStr(v[k])) out[k] = v[k];
  const runs = textRuns(v.descriptionRuns);
  if (runs) out.descriptionRuns = runs;
  const unknown = strings(v.unknown);
  if (unknown) out.unknown = unknown;
  return out;
}

/** A `slice` if all four borders are non-negative integers that leave room inside `w` x `h`; else null. */
function parseSlice(v: unknown, w: number, h: number): NineSlice | null {
  if (!isObj(v)) return null;
  const { left, top, right, bottom } = v;
  const ok = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  if (!ok(left) || !ok(top) || !ok(right) || !ok(bottom) || left + right >= w || top + bottom >= h) return null;
  return { left, top, right, bottom };
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
    for (const k of ["relic", "potion"] as const) {
      const stats = item[k] === undefined ? null : parseItemStats(item[k]);
      if (stats) clean[k] = stats;
      else delete clean[k];
    }
    const slice = item.slice === undefined ? null : parseSlice(item.slice, item.w, item.h);
    if (slice) clean.slice = slice;
    else delete clean.slice;
    items[id] = clean;
  }
  const out = { ...(json as unknown as SpireManifest), items };
  const layout = parseCardLayout(json.cardLayout);
  if (layout) out.cardLayout = layout;
  else delete out.cardLayout;
  return out;
}

/** A manifest's `cardLayout` if its size and every box are finite numbers (positive sizes); else null. */
function parseCardLayout(v: unknown): CardLayout | null {
  if (!isObj(v) || !isNum(v.w) || !isNum(v.h) || v.w <= 0 || v.h <= 0 || !isObj(v.boxes)) return null;
  const boxes: Record<string, CardLayoutBox> = Object.create(null);
  for (const [k, b] of Object.entries(v.boxes)) {
    if (!isObj(b) || !isNum(b.x) || !isNum(b.y) || !isNum(b.w) || !isNum(b.h) || b.w <= 0 || b.h <= 0) continue;
    boxes[k] = { x: b.x, y: b.y, w: b.w, h: b.h, ...(isNum(b.fontSize) && b.fontSize > 0 ? { fontSize: b.fontSize } : {}) };
  }
  return { w: v.w, h: v.h, boxes };
}
