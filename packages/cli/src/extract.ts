// `extract-art`: maps Spire UI ids to textures in the user's own game pack, writes WebP icons and
// manifest.json into a staging folder beside the output, then swaps it into place.
//
// Pack paths are untrusted. They are only ever used to look entries up in the pack's index; every
// output path is built from a fixed kind name, a slug matching [a-z0-9_-]+ and an integer size,
// and checked to stay inside the staging folder.
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import sharp, { type Sharp } from "sharp";
import { CARD_PIECES, type CardLayout, type Hsv, hsvTint, parseCardLayout, parseHsvMaterial, pieceBoxes } from "./card-pieces";
import { type CardFacts, readCards, toCardStats, UnsupportedBuildError } from "./card-stats";
import { HOVER_TIP_ID, HOVER_TIP_IMAGE, HOVER_TIP_SCENE, type HoverTipPatch, hoverTipSlice, parseHoverTipScene } from "./hover-tip";
import { type ItemFacts, type ItemKind, readItems, toItemStats } from "./item-stats";
import { CtexError, decodeCtex } from "./ctex";
import { Assembly, DotnetError, MAX_ASSEMBLY } from "./dotnet/metadata";
import { Model } from "./dotnet/model";
import { findAssembly } from "./game-paths";
import { embeddedSfnt, importTarget, parseAtlasTres, plainText, type Rect, unwrapRscc } from "./godot";
import { ASSET_KINDS, type AssetKind, type ManifestItem, type SpireManifest } from "./manifest";
import { type PckEntry, type PckIndex, readPckFile, readPckIndex } from "./pck";

export type ExtractErrorCode = "game-not-found" | "unsupported-game" | "out-not-replaceable" | "corrupt";

/** A problem with the user's input (game files or output folder), not a bug: exit code 2. */
export class ExtractError extends Error {
  constructor(
    readonly code: ExtractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

export const DEFAULT_KINDS: readonly AssetKind[] = ["relic", "potion", "class", "room", "ui"];
export const MAX_SIZE = 4096;
/** Default box sizes: 1x to 4x of a 64px-or-smaller icon, so browsers pick by pixel density. */
export const DEFAULT_SIZES: readonly number[] = [64, 128, 256];
/** Most sizes one run writes per icon; the resolver ignores a longer `widths` list. */
export const MAX_SIZES = 16;

/**
 * The box sizes to render for a source of `w` x `h`, from the sorted, de-duplicated `sizes`.
 * Never upscales: boxes smaller than the source's longer side are kept, and the first box that
 * would reach or pass it is rendered once at the source's own size; larger boxes are skipped.
 * Always at least one.
 */
export function plannedBoxes(sizes: readonly number[], w: number, h: number): number[] {
  const native = Math.max(w, h);
  const out: number[] = [];
  for (const s of sizes) {
    out.push(s);
    if (s >= native) break;
  }
  return out;
}

// --- id -> texture mapping -------------------------------------------------------------------

/** A texture source in the pack: a plain image (via its `.import`) or an atlas sprite (`.tres`). */
type Source = { image: string } | { sprite: string };
/** A localization string: file under localization/eng/ (without .json) and key. */
type Text = [file: string, key: string];

export interface TextureRef {
  /** The imported `.ctex` entry. */
  entry: PckEntry;
  /** Sprite region of an atlas, in the decoded texture's pixels. */
  region?: Rect;
  /** The sprite's trimmed transparent margin (see parseAtlasTres); only card pieces restore it. */
  margin?: Rect;
}

export interface MappedId {
  kind: AssetKind;
  slug: string;
  /** Null when the game has no texture for this id. */
  texture: TextureRef | null;
  name?: string;
  description?: string;
  /** The raw localization description (cards, relics, potions), for rendering with its numbers. */
  template?: string;
  /** A card piece (see card-pieces.ts): drawn at card scale, margin restored, tinted when `tint` is set. */
  piece?: { tint?: Hsv };
}

interface FixedId {
  id: string;
  kind: AssetKind;
  sources: Source[];
  title?: Text;
  description?: Text;
}

const ui = (name: string): Source => ({ sprite: `images/atlases/ui_atlas.sprites/${name}.tres` });
const room = (history: string | null, mapIcon: string | null, title: string, legend: string): Omit<FixedId, "id" | "kind"> => ({
  sources: [...(history ? [{ image: `images/ui/run_history/${history}.png` }] : []), ...(mapIcon ? [ui(`map/icons/${mapIcon}`)] : [])],
  title: ["static_hover_tips", `${title}.title`],
  description: ["map", `LEGEND_${legend}.hoverTip.description`],
});

/**
 * Ids with one fixed texture each. Rooms prefer the run history icons (what run rows show), else
 * the map icon; there is no generic boss icon (each boss has its own), so ROOM.BOSS stays unmapped.
 */
const FIXED: FixedId[] = [
  ...["ironclad", "silent", "defect", "regent", "necrobinder"].map((c) => ({
    id: `CHARACTER.${c.toUpperCase()}`,
    kind: "class" as const,
    sources: [{ image: `images/ui/top_panel/character_icon_${c}.png` }],
    title: ["characters", `${c.toUpperCase()}.title`] as Text,
    description: ["characters", `${c.toUpperCase()}.description`] as Text,
  })),
  { id: "ROOM.MONSTER", kind: "room", ...room("monster", "map_monster", "ROOM_ENEMY", "ENEMY") },
  { id: "ROOM.ELITE", kind: "room", ...room("elite", "map_elite", "ROOM_ELITE", "ELITE") },
  { id: "ROOM.REST", kind: "room", ...room("rest_site", "map_rest", "ROOM_REST", "REST") },
  { id: "ROOM.SHOP", kind: "room", ...room("shop", "map_shop", "ROOM_MERCHANT", "MERCHANT") },
  { id: "ROOM.TREASURE", kind: "room", ...room("treasure", "map_chest", "ROOM_TREASURE", "TREASURE") },
  { id: "ROOM.EVENT", kind: "room", ...room("event", null, "ROOM_EVENT", "EVENT") },
  { id: "ROOM.BOSS", kind: "room", ...room(null, null, "ROOM_BOSS", "BOSS") },
  { id: "ROOM.UNKNOWN", kind: "room", ...room(null, "map_unknown", "ROOM_UNKNOWN", "UNKNOWN"), title: ["map", "LEGEND_UNKNOWN.title"] },
  { id: "STAT.HP", kind: "ui", sources: [ui("top_bar/top_bar_heart")], title: ["static_hover_tips", "HIT_POINTS.title"] },
  { id: "STAT.GOLD", kind: "ui", sources: [ui("top_bar/top_bar_gold")], title: ["static_hover_tips", "MONEY_POUCH.title"] },
  {
    id: "STAT.ENERGY",
    kind: "ui",
    sources: [ui("card/energy_colorless"), { image: "images/packed/sprite_fonts/colorless_energy_icon.png" }],
    title: ["static_hover_tips", "ENERGY.title"],
  },
  { id: "STAT.ASCENSION", kind: "ui", sources: [ui("top_bar/top_bar_ascension")] },
  { id: "STAT.DECK", kind: "ui", sources: [ui("top_bar/top_bar_deck")] },
];

interface Collection {
  kind: AssetKind;
  prefix: string;
  /** Localization file listing the collection's ids as `<ID>.title`. */
  loc: string;
  /** Textures for a slug, best first, found by matching these pack paths. */
  sources: RegExp[];
}

/**
 * Relics and potions have a full-size image and an atlas sprite; cards have a portrait in a folder
 * per character (or colour), and a sprite in the card atlas. Items without final art use the beta
 * art the game itself shows for them. The first capture group is the slug; earlier patterns win.
 */
const COLLECTIONS: Collection[] = [
  {
    kind: "relic",
    prefix: "RELIC",
    loc: "relics",
    sources: [/^images\/relics\/([a-z0-9_]+)\.png\.import$/, /^images\/atlases\/relic_atlas\.sprites\/([a-z0-9_]+)\.tres$/, /^images\/relics\/beta\/([a-z0-9_]+)\.png\.import$/],
  },
  {
    kind: "potion",
    prefix: "POTION",
    loc: "potions",
    sources: [/^images\/potions\/([a-z0-9_]+)\.png\.import$/, /^images\/atlases\/potion_atlas\.sprites\/([a-z0-9_]+)\.tres$/, /^images\/potions\/beta\/([a-z0-9_]+)\.png\.import$/],
  },
  {
    kind: "card",
    prefix: "CARD",
    loc: "cards",
    sources: [
      /^images\/packed\/card_portraits\/[a-z0-9_]+\/([a-z0-9_]+)\.png\.import$/,
      /^images\/atlases\/card_atlas\.sprites\/[a-z0-9_]+\/([a-z0-9_]+)\.tres$/,
      /^images\/packed\/card_portraits\/[a-z0-9_]+\/beta\/([a-z0-9_]+)\.png\.import$/,
    ],
  },
];

const ID_BODY = /^[A-Z0-9_]+$/;
const SLUG = /^[a-z0-9_-]+$/;

/** A pack path (from a matched source pattern) back into a Source. */
function toSource(p: string): Source {
  return p.endsWith(".import") ? { image: p.slice(0, -".import".length) } : { sprite: p };
}

/**
 * Maps Spire UI ids to their textures in the pack, with English names and descriptions. Ids the
 * game names but has no texture for are included with `texture: null`.
 */
export async function mapIds(index: PckIndex, read: (e: PckEntry) => Promise<Buffer>, kinds: readonly AssetKind[] = DEFAULT_KINDS): Promise<Map<string, MappedId>> {
  const byPath = new Map(index.entries.map((e) => [e.path, e]));
  const text = async (p: string) => {
    const e = byPath.get(p);
    return e ? (await read(e)).toString("utf8") : null;
  };

  const locCache = new Map<string, Map<string, string> | null>();
  const loc = async (file: string): Promise<Map<string, string> | null> => {
    if (!locCache.has(file)) {
      const raw = await text(`localization/eng/${file}.json`);
      let parsed: unknown = null;
      if (raw !== null) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new ExtractError("corrupt", `localization/eng/${file}.json is not valid JSON`);
        }
      }
      const strings = new Map<string, string>();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") strings.set(k, v);
      }
      locCache.set(file, raw === null ? null : strings);
    }
    return locCache.get(file)!;
  };
  const imageCache = new Map<string, Promise<PckEntry | null>>();
  const resolveImage = (image: string) => {
    let hit = imageCache.get(image);
    if (!hit) {
      hit = (async () => {
        const remap = await text(`${image}.import`);
        const target = remap === null ? null : importTarget(remap);
        return (target && byPath.get(target)) || null;
      })();
      imageCache.set(image, hit);
    }
    return hit;
  };
  const resolve = async (sources: Source[]): Promise<TextureRef | null> => {
    for (const s of sources) {
      if ("image" in s) {
        const entry = await resolveImage(s.image);
        if (entry) return { entry };
      } else {
        const tres = await text(s.sprite);
        const sprite = tres === null ? null : parseAtlasTres(tres);
        const entry = sprite && (await resolveImage(sprite.atlas));
        if (sprite && entry) return { entry, region: sprite.region, ...(sprite.margin ? { margin: sprite.margin } : {}) };
      }
    }
    return null;
  };

  const want = new Set(kinds);
  const out = new Map<string, MappedId>();
  const add = async (id: string, kind: AssetKind, slug: string, sources: Source[], title?: string, description?: string) => {
    const name = title === undefined ? undefined : plainText(title) || undefined;
    const desc = description === undefined ? undefined : plainText(description) || undefined;
    const template = (kind === "card" || kind === "relic" || kind === "potion") && description !== undefined ? { template: description } : {};
    out.set(id, { kind, slug, texture: await resolve(sources), ...(name ? { name } : {}), ...(desc ? { description: desc } : {}), ...template });
  };

  for (const c of COLLECTIONS) {
    if (!want.has(c.kind)) continue;
    // Texture candidates per slug, in source preference order (paths sorted for determinism).
    const bySlug = new Map<string, Source[]>();
    const paths = index.entries.map((e) => e.path).sort();
    for (const pattern of c.sources) {
      for (const p of paths) {
        const slug = pattern.exec(p)?.[1];
        if (!slug) continue;
        const list = bySlug.get(slug) ?? [];
        list.push(toSource(p));
        bySlug.set(slug, list);
      }
    }
    // The localization file is the authority on which ids exist; without it, the texture names.
    const strings = await loc(c.loc);
    const ids = strings
      ? [...strings.keys()].filter((k) => k.endsWith(".title")).map((k) => k.slice(0, -".title".length))
      : [...bySlug.keys()].map((s) => s.toUpperCase());
    for (const body of [...new Set(ids)].sort()) {
      if (!ID_BODY.test(body)) continue;
      const slug = body.toLowerCase();
      await add(`${c.prefix}.${body}`, c.kind, slug, bySlug.get(slug) ?? [], strings?.get(`${body}.title`), strings?.get(`${body}.description`));
    }
  }

  for (const f of FIXED) {
    if (!want.has(f.kind)) continue;
    const slug = f.id.slice(f.id.indexOf(".") + 1).toLowerCase();
    const title = f.title ? (await loc(f.title[0]))?.get(f.title[1]) : undefined;
    const description = f.description ? (await loc(f.description[0]))?.get(f.description[1]) : undefined;
    await add(f.id, f.kind, slug, f.sources, title, description);
  }

  if (want.has("ui")) {
    // A piece whose material is missing or not the hsv shader is left unmapped: drawn untinted it
    // would be the wrong colour, so pages fall back to their own frame instead.
    const materials = new Map<string, Hsv | null>();
    for (const p of CARD_PIECES) {
      let tint: Hsv | undefined;
      if (p.material) {
        if (!materials.has(p.material)) {
          const t = await text(p.material);
          materials.set(p.material, t === null ? null : parseHsvMaterial(t));
        }
        tint = materials.get(p.material) ?? undefined;
      }
      const texture = p.material && !tint ? null : await resolve([p.source]);
      out.set(p.id, { kind: "ui", slug: p.slug, texture, piece: tint ? { tint } : {} });
    }
    // The hover tip panel: drawn as it is, at piece scales (it is stretched, not shown as an icon).
    out.set(HOVER_TIP_ID, { kind: "ui", slug: "hover_tip", texture: await resolve([{ image: HOVER_TIP_IMAGE }]), piece: {} });
  }
  return out;
}

/** The hover tip scene's nine-patch, or null when the scene is missing or not one this version reads. */
export async function readHoverTip(index: PckIndex, read: (e: PckEntry) => Promise<Buffer>): Promise<HoverTipPatch | null> {
  const entry = index.entries.find((e) => e.path === HOVER_TIP_SCENE);
  if (!entry || entry.size > 1024n * 1024n) return null;
  const data = await read(entry);
  if (data.subarray(0, 4).toString("latin1") !== "[gd_") return null;
  return parseHoverTipScene(data.toString("utf8"));
}

/** The card scene's layout (see card-pieces.ts), or null when the scene is missing or unreadable. */
export async function readCardLayout(index: PckIndex, read: (e: PckEntry) => Promise<Buffer>): Promise<CardLayout | null> {
  const entry = index.entries.find((e) => e.path === "scenes/cards/card.tscn");
  if (!entry || entry.size > 4n * 1024n * 1024n) return null;
  const data = await read(entry);
  // A binary (RSCC-compressed or .scn) scene is not something this reader understands.
  if (data.subarray(0, 4).toString("latin1") !== "[gd_") return null;
  return parseCardLayout(data.toString("utf8"));
}

// --- output ----------------------------------------------------------------------------------

/** Output path for one icon, built only from validated parts and confined to `root`. */
/** Relative file name for one icon: `<kind>/<slug>@<width>.webp`, named by its actual pixel width. */
function iconFile(kind: AssetKind, slug: string, width: number): string {
  if (!ASSET_KINDS.includes(kind) || !SLUG.test(slug) || !Number.isInteger(width) || width < 1) throw new Error(`refusing output name ${kind}/${slug}@${width}`);
  return `${kind}/${slug}@${width}.webp`;
}

function confined(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  const back = path.relative(root, full);
  if (back.startsWith("..") || path.isAbsolute(back)) throw new Error(`refusing to write outside the output folder: ${rel}`);
  return full;
}

/** The game fonts `--fonts` copies, by manifest role. */
const FONTS: { role: "display" | "body"; slug: string; res: string }[] = [
  { role: "display", slug: "kreon_bold", res: "fonts/kreon_bold.ttf" },
  { role: "body", slug: "spectral_bold", res: "fonts/spectral_bold.ttf" },
];

/** Staging folders in use, so an interrupted run can remove them (see index.ts). */
export const activeStaging = new Set<string>();

/** Runs jobs with bounded concurrency. */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

/** The game's version: release_info.json in the pack if present, else the one Steam ships beside it. */
async function gameVersion(pck: string, index: PckIndex): Promise<string> {
  const entry = index.entries.find((e) => e.path === "release_info.json");
  let raw: string | null = null;
  try {
    raw = entry ? (await readPckFile(pck, entry)).toString("utf8") : fs.readFileSync(path.join(path.dirname(pck), "release_info.json"), "utf8");
  } catch {
    return "unknown";
  }
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "string" && /^[\w.+-]{1,64}$/.test(v) ? v : "unknown";
  } catch {
    return "unknown";
  }
}

/** Marker file that, with a spire-ui manifest, proves a folder is a previous extraction. */
export const MARKER = ".spire-ui-art";
const MARKER_TEXT = "Written by spire-ui extract-art. This folder is replaced on every run.\n";
export const GENERATOR = "spire-ui";
/** Everything an extraction writes at its top level. */
const OWNED = new Set<string>([...ASSET_KINDS, "fonts", "manifest.json", MARKER]);

/** Whether `out` holds manifest.json written by spire-ui (generator field, schema 1, items object). */
function hasOwnManifest(out: string): boolean {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")) as Record<string, unknown>;
    return m.generator === GENERATOR && m.schemaVersion === 1 && typeof m.items === "object" && m.items !== null && !Array.isArray(m.items);
  } catch {
    return false;
  }
}

/**
 * Throws unless `out` is absent, empty, or provably a previous extraction: it has the marker file
 * and a spire-ui manifest.json, and nothing at its top level that an extraction does not write.
 * Any other folder (a web app's public/ with its own manifest.json, say) is never replaced.
 */
function checkReplaceable(out: string): void {
  let entries: string[];
  try {
    if (!fs.statSync(out).isDirectory()) throw new ExtractError("out-not-replaceable", `${out} exists and is not a folder`);
    entries = fs.readdirSync(out);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (entries.length === 0) return;
  const refuse = (why: string) => new ExtractError("out-not-replaceable", `refusing to replace ${out}: ${why}; pick an empty or new --out folder`);
  if (!entries.includes(MARKER) || !hasOwnManifest(out)) throw refuse("it is not a previous spire-ui extract-art output");
  const foreign = entries.filter((e) => !OWNED.has(e));
  if (foreign.length) throw refuse(`it contains files spire-ui did not write (${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ", ..." : ""})`);
}

export interface ExtractOptions {
  /** The game's .pck file. */
  pck: string;
  /**
   * The game's sts2.dll, read for card, relic and potion stats when `kinds` has those. Default:
   * found beside the pack; null: do not read stats.
   */
  assembly?: string | null;
  out: string;
  /**
   * Box sizes in pixels. Each icon is written once per size that does not upscale it (see
   * plannedBoxes), named by its actual width; the item's `widths` lists them and `file` is the largest.
   */
  sizes: number[];
  kinds: readonly AssetKind[];
  fonts: boolean;
  warn?: (message: string) => void;
}

export interface ExtractSummary {
  gameVersion: string;
  engine: string;
  counts: Record<AssetKind, number>;
  /** Ids the game names that have no texture (they render with the fallback art). */
  unmapped: string[];
  fonts: string[];
  files: number;
  bytes: number;
  /** Card stats written (null when cards were not extracted or the game's code was unreadable). */
  cardStats: { cards: number; withUnknown: string[] } | null;
  /** Relic / potion stats written, by kind (absent when that kind was not extracted or unreadable). */
  itemStats: Partial<Record<ItemKind, { items: number; withUnknown: string[] }>>;
}

interface GameFacts {
  cards: Map<string, CardFacts> | null;
  relic: Map<string, ItemFacts> | null;
  potion: Map<string, ItemFacts> | null;
}

/**
 * Card, relic and potion facts from the game's code, for the wanted kinds; each is null (with a
 * warning) when the code is missing or not a build its reader understands. Art never depends on it.
 */
function loadFacts(file: string | null, kinds: readonly AssetKind[], warn?: (message: string) => void): GameFacts {
  const none: GameFacts = { cards: null, relic: null, potion: null };
  const wanted = (["card", "relic", "potion"] as const).filter((k) => kinds.includes(k));
  if (wanted.length === 0) return none;
  if (!file) {
    warn?.("stats skipped: the game's sts2.dll was not found beside the pack");
    return none;
  }
  let model: Model;
  try {
    const size = fs.statSync(file).size;
    if (size > MAX_ASSEMBLY) throw new DotnetError("unsupported", `it is larger than ${MAX_ASSEMBLY / 1024 / 1024} MB`);
    model = new Model(new Assembly(fs.readFileSync(file)));
  } catch (e) {
    if (e instanceof DotnetError) warn?.(`stats skipped: ${file} is not a game build this version understands (${e.message})`);
    else warn?.(`stats skipped: cannot read ${file} (${e instanceof Error ? e.message : String(e)})`);
    return none;
  }
  // Stats are optional: no failure reading them (even a bug here) costs the user their art.
  const attempt = <T>(what: string, fn: () => T): T | null => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof DotnetError || e instanceof UnsupportedBuildError) warn?.(`${what} stats skipped: ${file} is not a game build this version understands (${e.message})`);
      else warn?.(`${what} stats skipped: cannot read ${file} (${e instanceof Error ? e.message : String(e)})`);
      return null;
    }
  };
  return {
    cards: wanted.includes("card") ? attempt("card", () => readCards(model)) : null,
    relic: wanted.includes("relic") ? attempt("relic", () => readItems(model, "relic")) : null,
    potion: wanted.includes("potion") ? attempt("potion", () => readItems(model, "potion")) : null,
  };
}

export async function extract(o: ExtractOptions): Promise<ExtractSummary> {
  const sizes = [...new Set(o.sizes)].sort((a, b) => a - b);
  if (sizes.length === 0 || sizes.length > MAX_SIZES || !sizes.every((s) => Number.isInteger(s) && s >= 1 && s <= MAX_SIZE)) {
    throw new RangeError(`sizes must be 1 to ${MAX_SIZES} integers from 1 to ${MAX_SIZE}`);
  }
  const out = path.resolve(o.out);

  const index = await readPckIndex(o.pck);
  if (index.engine[0] !== 4) throw new ExtractError("unsupported-game", `${o.pck} was made with Godot ${index.engine.join(".")}; only Godot 4 packs are supported`);
  checkReplaceable(out);
  const version = await gameVersion(o.pck, index);
  const read = (e: PckEntry) => readPckFile(o.pck, e);
  const mapped = await mapIds(index, read, o.kinds);
  const cardLayout = o.kinds.includes("ui") ? await readCardLayout(index, read) : null;
  const hasPieces = [...mapped].some(([id, m]) => id !== HOVER_TIP_ID && m.piece && m.texture);
  if (hasPieces && !cardLayout) o.warn?.("card layout not found: scenes/cards/card.tscn is missing or not a scene this version reads");
  const hoverTip = o.kinds.includes("ui") ? await readHoverTip(index, read) : null;
  const facts: GameFacts = o.assembly === null ? { cards: null, relic: null, potion: null } : loadFacts(o.assembly ?? findAssembly(o.pck), o.kinds, o.warn);
  const cardFacts = facts.cards;
  const withUnknown: string[] = [];
  let cardStats = 0;
  const itemCounts: Record<ItemKind, { items: number; withUnknown: string[] }> = { relic: { items: 0, withUnknown: [] }, potion: { items: 0, withUnknown: [] } };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const staging = fs.mkdtempSync(`${out}.tmp-`);
  activeStaging.add(staging);
  // mkdtemp creates the dir 0700 and the rename keeps that, which locks out a web server running
  // as another user (and survives rsync -a). Give it the mode mkdir would: 0777 minus the umask.
  const umask = process.umask();
  fs.chmodSync(staging, 0o777 & ~umask);
  try {
    const items: Record<string, ManifestItem> = {};
    const counts = Object.fromEntries(ASSET_KINDS.map((k) => [k, 0])) as Record<AssetKind, number>;
    let files = 0;
    let bytes = 0;
    const write = (file: string, data: Buffer) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data, { flag: "wx" });
      files++;
      bytes += data.length;
    };

    // One decode per texture; atlases shared by many sprites are decoded to raw pixels once.
    const groups = new Map<string, { entry: PckEntry; ids: [string, MappedId][] }>();
    for (const [id, m] of mapped) {
      if (!m.texture) continue;
      const g = groups.get(m.texture.entry.path) ?? { entry: m.texture.entry, ids: [] };
      g.ids.push([id, m]);
      groups.set(m.texture.entry.path, g);
    }
    await pool([...groups.values()], 4, async ({ entry, ids }) => {
      const { png, w, h } = await decodeCtex(await read(entry)).catch((e: unknown) => {
        throw e instanceof CtexError ? new CtexError(e.code, `${entry.path}: ${e.message}`) : e;
      });
      const shared = ids.length > 1 ? await sharp(png).ensureAlpha().raw().toBuffer() : null;
      const source = (): Sharp => (shared ? sharp(shared, { raw: { width: w, height: h, channels: 4 } }) : sharp(png));
      for (const [id, m] of ids) {
        const r = m.texture!.region;
        if (r && (r.x + r.w > w || r.y + r.h > h)) throw new ExtractError("corrupt", `${id}: sprite region lies outside its ${w}x${h} atlas`);
        let sw = r ? r.w : w;
        let sh = r ? r.h : h;
        let render = (): Sharp => {
          const img = source();
          return r ? img.extract({ left: r.x, top: r.y, width: r.w, height: r.h }) : img;
        };
        let boxes = plannedBoxes(sizes, sw, sh);
        if (m.piece) {
          // Card pieces: tinted once at full size, transparent margin restored so every piece keeps
          // the size the card scene lays out, then written at card scales.
          const raw = await render().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          if (m.piece.tint) hsvTint(raw.data, m.piece.tint);
          const mg = m.texture!.margin;
          let img = sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } });
          if (mg) {
            img = img.extend({ left: mg.x, top: mg.y, right: mg.w - mg.x, bottom: mg.h - mg.y, background: { r: 0, g: 0, b: 0, alpha: 0 } });
            sw += mg.w;
            sh += mg.h;
          }
          const full = await img.raw().toBuffer({ resolveWithObject: true });
          render = () => sharp(full.data, { raw: { width: full.info.width, height: full.info.height, channels: 4 } });
          boxes = pieceBoxes(sw, sh);
        }
        // Rendered per box, keyed by actual width: two boxes that round to the same width keep the larger.
        const byWidth = new Map<number, { data: Buffer; width: number; height: number }>();
        for (const box of boxes) {
          const img = render();
          const { data, info } = await img
            .resize({ width: box, height: box, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82, alphaQuality: 90, effort: 5 })
            .toBuffer({ resolveWithObject: true });
          byWidth.set(info.width, { data, width: info.width, height: info.height });
        }
        const outputs = [...byWidth.values()].sort((a, b) => a.width - b.width);
        for (const o of outputs) write(confined(staging, iconFile(m.kind, m.slug, o.width)), o.data);
        const top = outputs[outputs.length - 1]!;
        const cf = m.kind === "card" ? cardFacts?.get(id) : undefined;
        const card = cf ? toCardStats(cf, m.template) : undefined;
        if (card) {
          cardStats++;
          if (card.unknown) withUnknown.push(id);
        }
        const itemKind = m.kind === "relic" || m.kind === "potion" ? m.kind : null;
        const itemFacts = itemKind ? facts[itemKind]?.get(id) : undefined;
        const item = itemKind && itemFacts ? toItemStats(itemFacts, m.template) : undefined;
        if (itemKind && item) {
          itemCounts[itemKind].items++;
          if (item.unknown) itemCounts[itemKind].withUnknown.push(id);
        }
        // The nine-slice borders, in the largest file's pixels (the texture's own size or smaller).
        const tipSlice = id === HOVER_TIP_ID && hoverTip ? hoverTipSlice(hoverTip, sw, sh) : null;
        const scale = top.width / sw;
        const slice = tipSlice
          ? { left: Math.round(tipSlice.left * scale), top: Math.round(tipSlice.top * scale), right: Math.round(tipSlice.right * scale), bottom: Math.round(tipSlice.bottom * scale) }
          : null;
        items[id] = {
          kind: m.kind,
          file: iconFile(m.kind, m.slug, top.width),
          w: top.width,
          h: top.height,
          widths: outputs.map((o) => o.width),
          ...(m.name ? { name: m.name } : {}),
          ...(m.description ? { description: m.description } : {}),
          ...(card ? { card } : {}),
          ...(itemKind && item ? { [itemKind]: item } : {}),
          ...(slice ? { slice } : {}),
        };
        counts[m.kind]++;
      }
    });

    const fonts: NonNullable<SpireManifest["fonts"]> = {};
    const fontFiles: string[] = [];
    if (o.fonts) {
      const byPath = new Map(index.entries.map((e) => [e.path, e]));
      for (const f of FONTS) {
        const remap = byPath.get(`${f.res}.import`);
        const target = remap ? importTarget((await read(remap)).toString("utf8")) : null;
        const data = target ? byPath.get(target) : undefined;
        const sfnt = data ? embeddedSfnt(unwrapRscc(await read(data))) : null;
        if (!sfnt) {
          o.warn?.(`font ${f.res} not found in this game version`);
          continue;
        }
        const rel = `fonts/${f.slug}.ttf`;
        write(confined(staging, rel), sfnt);
        fonts[f.role] = rel;
        fontFiles.push(rel);
      }
    }

    const sortedItems = Object.fromEntries(Object.entries(items).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    // `sizes` is an extension to the schema: the box sizes this run was asked for. Which files each
    // item actually has is its `widths` (small sources skip boxes that would upscale them).
    const manifest: SpireManifest & { generator: string; sizes: number[] } = {
      schemaVersion: 1,
      generator: GENERATOR,
      gameVersion: version,
      generatedAt: new Date().toISOString(),
      sizes,
      items: sortedItems,
      ...(fontFiles.length ? { fonts } : {}),
      ...(cardLayout ? { cardLayout } : {}),
    };
    write(confined(staging, "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    write(confined(staging, MARKER), Buffer.from(MARKER_TEXT));

    swapIntoPlace(staging, out, o.warn);
    activeStaging.delete(staging);
    const unmapped = [...mapped].filter(([, m]) => !m.texture).map(([id]) => id);
    return {
      gameVersion: version,
      engine: index.engine.join("."),
      counts,
      unmapped,
      fonts: fontFiles,
      files,
      bytes,
      cardStats: cardFacts ? { cards: cardStats, withUnknown: withUnknown.sort() } : null,
      itemStats: Object.fromEntries((["relic", "potion"] as const).filter((k) => facts[k]).map((k) => [k, { items: itemCounts[k].items, withUnknown: itemCounts[k].withUnknown.sort() }])),
    };
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    activeStaging.delete(staging);
    throw e;
  }
}

/** Replaces `out` with `staging`; the previous output is kept until the new one is in place. */
function swapIntoPlace(staging: string, out: string, warn?: (message: string) => void): void {
  checkReplaceable(out);
  if (!fs.existsSync(out)) {
    fs.renameSync(staging, out);
    return;
  }
  const old = `${out}.old-${randomBytes(4).toString("hex")}`;
  fs.renameSync(out, old);
  try {
    fs.renameSync(staging, out);
  } catch (e) {
    fs.renameSync(old, out);
    throw e;
  }
  // The new output is in place; failing to delete the old one should not fail the run.
  try {
    fs.rmSync(old, { recursive: true, force: true });
  } catch (e) {
    warn?.(`could not remove the previous output at ${old} (${(e as Error).message}); delete it yourself`);
  }
}
