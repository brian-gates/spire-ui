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
import { CtexError, decodeCtex } from "./ctex";
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
}

export interface MappedId {
  kind: AssetKind;
  slug: string;
  /** Null when the game has no texture for this id. */
  texture: TextureRef | null;
  name?: string;
  description?: string;
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
        if (sprite && entry) return { entry, region: sprite.region };
      }
    }
    return null;
  };

  const want = new Set(kinds);
  const out = new Map<string, MappedId>();
  const add = async (id: string, kind: AssetKind, slug: string, sources: Source[], title?: string, description?: string) => {
    const name = title === undefined ? undefined : plainText(title) || undefined;
    const desc = description === undefined ? undefined : plainText(description) || undefined;
    out.set(id, { kind, slug, texture: await resolve(sources), ...(name ? { name } : {}), ...(desc ? { description: desc } : {}) });
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
  return out;
}

// --- output ----------------------------------------------------------------------------------

/** Output path for one icon, built only from validated parts and confined to `root`. */
function iconPath(root: string, kind: AssetKind, slug: string, size: number): string {
  if (!ASSET_KINDS.includes(kind) || !SLUG.test(slug) || !Number.isInteger(size)) throw new Error(`refusing output name ${kind}/${slug}@${size}`);
  return confined(root, `${kind}/${slug}@${size}.webp`);
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
  out: string;
  /** Box sizes in pixels; the largest is the manifest's `file`. */
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
}

export async function extract(o: ExtractOptions): Promise<ExtractSummary> {
  const sizes = [...new Set(o.sizes)].sort((a, b) => a - b);
  if (sizes.length === 0 || !sizes.every((s) => Number.isInteger(s) && s >= 1 && s <= MAX_SIZE)) throw new RangeError(`sizes must be integers from 1 to ${MAX_SIZE}`);
  const largest = sizes[sizes.length - 1]!;
  const out = path.resolve(o.out);

  const index = await readPckIndex(o.pck);
  if (index.engine[0] !== 4) throw new ExtractError("unsupported-game", `${o.pck} was made with Godot ${index.engine.join(".")}; only Godot 4 packs are supported`);
  checkReplaceable(out);
  const version = await gameVersion(o.pck, index);
  const read = (e: PckEntry) => readPckFile(o.pck, e);
  const mapped = await mapIds(index, read, o.kinds);

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
        for (const size of sizes) {
          let img = source();
          if (r) img = img.extract({ left: r.x, top: r.y, width: r.w, height: r.h });
          const { data, info } = await img
            .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82, alphaQuality: 90, effort: 5 })
            .toBuffer({ resolveWithObject: true });
          write(iconPath(staging, m.kind, m.slug, size), data);
          if (size === largest) {
            items[id] = { kind: m.kind, file: `${m.kind}/${m.slug}@${size}.webp`, w: info.width, h: info.height, ...(m.name ? { name: m.name } : {}), ...(m.description ? { description: m.description } : {}) };
            counts[m.kind]++;
          }
        }
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
    // `sizes` is an extension to the schema: every item also exists at each listed size, at the
    // same path with `@<size>` in place of the largest size.
    const manifest: SpireManifest & { generator: string; sizes: number[] } = {
      schemaVersion: 1,
      generator: GENERATOR,
      gameVersion: version,
      generatedAt: new Date().toISOString(),
      sizes,
      items: sortedItems,
      ...(fontFiles.length ? { fonts } : {}),
    };
    write(confined(staging, "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    write(confined(staging, MARKER), Buffer.from(MARKER_TEXT));

    swapIntoPlace(staging, out, o.warn);
    activeStaging.delete(staging);
    const unmapped = [...mapped].filter(([, m]) => !m.texture).map(([id]) => id);
    return { gameVersion: version, engine: index.engine.join("."), counts, unmapped, fonts: fontFiles, files, bytes };
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
