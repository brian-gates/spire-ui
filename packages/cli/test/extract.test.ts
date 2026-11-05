import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { afterAll, describe, expect, test } from "vitest";
import { parseManifest, resolveAsset } from "../../../registry/spire/lib/assets";
import { CtexError } from "../src/ctex";
import { ExtractError, extract, mapIds } from "../src/extract";
import { embeddedSfnt, plainText, unwrapRscc } from "../src/godot";
import { readPckFile, readPckIndex } from "../src/pck";
import { atlasTres, buildPck, fakeSfnt, type FakeFile, importFile, pngCtex, rscc, solidPng, zstdStored } from "./fixtures";
import { buildGameAssembly } from "./game-assembly";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spire-extract-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PCK_NAME = "Slay the Spire 2.pck";

// Invented strings in the game's localization format; no game text in the repo.
const relicsJson = {
  "ANCHOR.title": "Tin Anchor",
  "ANCHOR.description": "Start each combat with [blue]{Block}[/blue] [gold]Block[/gold].",
  "ANCHOR.flavor": "Heavy.",
  "RING_OF_THE_SNAKE.title": "Ring of the Snake",
  "RING_OF_THE_SNAKE.description": "Draw [blue]{Cards}[/blue] additional {Cards:plural:card|cards}.",
  "MISSING_RELIC.title": "Missing Relic",
  "../../EVIL.title": "Evil",
};

/** Synthetic game files: two relics (one plain image, one atlas sprite), one potion, fonts, text. */
async function gameFiles(o: { brokenAnchor?: boolean } = {}): Promise<FakeFile[]> {
  const anchor = pngCtex(await solidPng(80, 80, [200, 30, 30]), 80, 80);
  const atlas = pngCtex(await solidPng(128, 128, [30, 200, 30]), 128, 128);
  const potion = pngCtex(await solidPng(40, 48, [30, 30, 200]), 40, 48);
  const kreon = Buffer.concat([Buffer.from("RSRC fontdata header\x00\x01\x00\x00junk"), fakeSfnt(0x22), Buffer.from("trailing cache")]);
  const spectral = Buffer.concat([Buffer.from("RSRC"), fakeSfnt(0x33)]);
  return [
    { path: "localization/eng/relics.json", data: Buffer.from(JSON.stringify(relicsJson)) },
    { path: "images/relics/anchor.png.import", data: importFile(".godot/imported/anchor.png-1.bptc.ctex") },
    { path: ".godot/imported/anchor.png-1.bptc.ctex", data: o.brokenAnchor ? anchor.subarray(0, 60) : anchor },
    { path: "images/atlases/relic_atlas.sprites/ring_of_the_snake.tres", data: atlasTres("images/atlases/relic_atlas.png", 10, 20, 70, 60) },
    { path: "images/atlases/relic_atlas.png.import", data: importFile(".godot/imported/relic_atlas.png-2.ctex", "path") },
    { path: ".godot/imported/relic_atlas.png-2.ctex", data: atlas },
    { path: "images/potions/fire_potion.png.import", data: importFile(".godot/imported/fire_potion.png-3.s3tc.ctex", "path.s3tc") },
    { path: ".godot/imported/fire_potion.png-3.s3tc.ctex", data: potion },
    // Hostile names: must never become output paths.
    { path: "images/relics/../../evil.png.import", data: importFile(".godot/imported/anchor.png-1.bptc.ctex") },
    { path: "images/potions/../../../evil_potion.png.import", data: importFile(".godot/imported/fire_potion.png-3.s3tc.ctex") },
    { path: "fonts/kreon_bold.ttf.import", data: Buffer.from('[remap]\nimporter="font_data_dynamic"\npath="res://.godot/imported/kreon_bold.ttf-4.fontdata"\n') },
    { path: ".godot/imported/kreon_bold.ttf-4.fontdata", data: rscc(kreon, 2, 64, zstdStored) },
    { path: "fonts/spectral_bold.ttf.import", data: Buffer.from('[remap]\nimporter="font_data_dynamic"\npath="res://.godot/imported/spectral_bold.ttf-5.fontdata"\n') },
    { path: ".godot/imported/spectral_bold.ttf-5.fontdata", data: rscc(spectral, 1, 50, (b) => deflateSync(b)) },
  ];
}

let n = 0;
/** A synthetic game install: the pack plus the release_info.json Steam ships beside it. */
async function fakeGame(o: { brokenAnchor?: boolean } = {}): Promise<string> {
  const dir = path.join(tmp, `game-${n++}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, PCK_NAME), buildPck({ files: await gameFiles(o) }));
  fs.writeFileSync(path.join(dir, "release_info.json"), JSON.stringify({ version: "v9.9.9", commit: "abc" }));
  return dir;
}

const outDir = (name: string) => path.join(tmp, `out-${name}-${n++}`, "public", "spire");
const siblings = (out: string) => fs.readdirSync(path.dirname(out)).filter((f) => f !== path.basename(out));
const DEFAULT_KINDS = ["relic", "potion", "class", "room", "ui"] as const;

describe("extract", () => {
  // The output is staged in a mkdtemp dir (mode 0700) and renamed into place. It must end up with
  // normal permissions, or a web server running as another user (and rsync -a copies) can't read it.
  test.skipIf(process.platform === "win32")("output folder gets normal permissions, not the private staging mode", async () => {
    const game = await fakeGame();
    const out = outDir("mode");
    const old = process.umask(0o022);
    try {
      await extract({ pck: path.join(game, PCK_NAME), out, sizes: [64], kinds: [...DEFAULT_KINDS], fonts: false });
    } finally {
      process.umask(old);
    }
    expect(fs.statSync(out).mode & 0o777).toBe(0o755);
  });

  test("writes every mapped icon at each size and a manifest the resolver accepts", async () => {
    const game = await fakeGame();
    const out = outDir("ok");
    const summary = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [32, 64], kinds: [...DEFAULT_KINDS], fonts: false });

    for (const f of ["relic/anchor", "relic/ring_of_the_snake", "potion/fire_potion"]) {
      for (const size of [32, 64]) expect(fs.existsSync(path.join(out, `${f}@${size}.webp`)), `${f}@${size}`).toBe(true);
    }
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")));
    expect(manifest).not.toBeNull();
    expect(manifest!.schemaVersion).toBe(1);
    expect(manifest!.gameVersion).toBe("v9.9.9");
    expect(Date.parse(manifest!.generatedAt)).not.toBeNaN();
    expect(manifest!.items["RELIC.ANCHOR"]).toEqual({
      kind: "relic",
      file: "relic/anchor@64.webp",
      w: 64,
      h: 64,
      name: "Tin Anchor",
      description: "Start each combat with X Block.",
    });
    expect(manifest!.items["RELIC.RING_OF_THE_SNAKE"]).toMatchObject({ kind: "relic", file: "relic/ring_of_the_snake@64.webp", w: 64, h: 55, name: "Ring of the Snake", description: "Draw X additional cards." });
    // No localization for potions: the id comes from the texture name, and the image is never upscaled.
    expect(manifest!.items["POTION.FIRE_POTION"]).toEqual({ kind: "potion", file: "potion/fire_potion@64.webp", w: 40, h: 48 });
    expect(manifest!.fonts).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")).sizes).toEqual([32, 64]);

    // w/h describe the file they sit beside.
    for (const item of Object.values(manifest!.items)) {
      const meta = await sharp(path.join(out, item.file)).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["webp", item.w, item.h]);
    }
    const small = await sharp(path.join(out, "relic/ring_of_the_snake@32.webp")).metadata();
    expect([small.width, small.height]).toEqual([32, 27]);
    // The atlas sprite is its region of the atlas: solid green.
    const { data } = await sharp(path.join(out, "relic/ring_of_the_snake@64.webp")).raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)].map((v) => Math.round(v / 10))).toEqual([3, 20, 3]);

    expect(Object.keys(manifest!.items).sort()).toEqual(["POTION.FIRE_POTION", "RELIC.ANCHOR", "RELIC.RING_OF_THE_SNAKE"]);
    expect(summary.counts).toMatchObject({ relic: 2, potion: 1, class: 0, room: 0, ui: 0 });
    expect(summary.unmapped).toContain("RELIC.MISSING_RELIC");
    expect(summary.gameVersion).toBe("v9.9.9");
    expect(siblings(out)).toEqual([]);
  });

  test("hostile pack names never escape the output directory", async () => {
    const game = await fakeGame();
    const out = outDir("hostile");
    await extract({ pck: path.join(game, PCK_NAME), out, sizes: [16], kinds: [...DEFAULT_KINDS], fonts: true });
    const all = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const written = all(tmp).filter((f) => /evil/i.test(f));
    expect(written).toEqual([]);
    for (const f of all(out)) expect(path.relative(out, f)).toMatch(/^(manifest\.json|\.spire-ui-art|(relic|potion|class|room|ui|card)\/[a-z0-9_-]+@\d+\.webp|fonts\/[a-z0-9_-]+\.ttf)$/);
  });

  test("--fonts copies the game's fonts and records them in the manifest", async () => {
    const game = await fakeGame();
    const out = outDir("fonts");
    const summary = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [64], kinds: ["relic"], fonts: true });
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")))!;
    expect(manifest.fonts).toEqual({ display: "fonts/kreon_bold.ttf", body: "fonts/spectral_bold.ttf" });
    expect(fs.readFileSync(path.join(out, "fonts/kreon_bold.ttf")).equals(fakeSfnt(0x22))).toBe(true);
    expect(fs.readFileSync(path.join(out, "fonts/spectral_bold.ttf")).equals(fakeSfnt(0x33))).toBe(true);
    expect(summary.fonts).toEqual(["fonts/kreon_bold.ttf", "fonts/spectral_bold.ttf"]);
    expect(manifest.items["POTION.FIRE_POTION"]).toBeUndefined(); // --kinds relic
  });

  test("a decode failure midway leaves neither the output nor a temp directory", async () => {
    const game = await fakeGame({ brokenAnchor: true });
    const out = outDir("broken");
    await expect(extract({ pck: path.join(game, PCK_NAME), out, sizes: [32, 64], kinds: [...DEFAULT_KINDS], fonts: true })).rejects.toBeInstanceOf(CtexError);
    expect(fs.existsSync(out)).toBe(false);
    expect(siblings(out)).toEqual([]);
  });

  test("re-running replaces the previous output as a whole", async () => {
    const game = await fakeGame();
    const out = outDir("rerun");
    const pck = path.join(game, PCK_NAME);
    await extract({ pck, out, sizes: [32, 64], kinds: [...DEFAULT_KINDS], fonts: true });
    const written = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(written.generator).toBe("spire-ui");
    expect(fs.existsSync(path.join(out, ".spire-ui-art"))).toBe(true);
    fs.writeFileSync(path.join(out, "relic/stale@64.webp"), "from an older game version");
    const before = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")).generatedAt as string;
    await new Promise((r) => setTimeout(r, 5));

    await extract({ pck, out, sizes: [48], kinds: ["potion"], fonts: false });
    expect(fs.existsSync(path.join(out, "relic/stale@64.webp"))).toBe(false);
    expect(fs.existsSync(path.join(out, "fonts"))).toBe(false);
    expect(fs.existsSync(path.join(out, "relic"))).toBe(false);
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")))!;
    expect(Object.keys(manifest.items)).toEqual(["POTION.FIRE_POTION"]);
    expect(manifest.items["POTION.FIRE_POTION"]!.file).toBe("potion/fire_potion@48.webp");
    expect(manifest.generatedAt).not.toBe(before);
    expect(siblings(out)).toEqual([]);

    // A failed re-run keeps the previous output untouched.
    const broken = await fakeGame({ brokenAnchor: true });
    await expect(extract({ pck: path.join(broken, PCK_NAME), out, sizes: [32], kinds: ["relic"], fonts: false })).rejects.toThrow();
    expect(Object.keys(parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")))!.items)).toEqual(["POTION.FIRE_POTION"]);
    expect(siblings(out)).toEqual([]);
  });

  test("refuses to replace a directory that is not a previous extraction", async () => {
    const game = await fakeGame();
    const out = outDir("foreign");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), "<p>mine</p>");
    const err = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [32], kinds: ["relic"], fonts: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).code).toBe("out-not-replaceable");
    expect(fs.readdirSync(out)).toEqual(["index.html"]);
    expect(siblings(out)).toEqual([]);
  });

  /** Every file under `dir` with its bytes, to prove a refused folder is untouched. */
  const snapshot = (dir: string): Record<string, string> =>
    Object.fromEntries(
      (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
        .filter((e) => e.isFile())
        .map((e) => {
          const f = path.join(e.parentPath, e.name);
          return [path.relative(dir, f), fs.readFileSync(f).toString("base64")];
        }),
    );

  test("refuses a web app folder that has its own manifest.json and leaves it untouched", async () => {
    const game = await fakeGame();
    const out = outDir("webapp");
    fs.mkdirSync(path.join(out, "relic"), { recursive: true });
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ name: "My App", icons: [{ src: "logo192.png", sizes: "192x192" }] }));
    fs.writeFileSync(path.join(out, "index.html"), "<p>mine</p>");
    fs.writeFileSync(path.join(out, "relic", "mine.txt"), "user data");
    const before = snapshot(out);
    const err = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [32], kinds: ["relic"], fonts: false }).catch((e: unknown) => e);
    expect((err as ExtractError).code).toBe("out-not-replaceable");
    expect(snapshot(out)).toEqual(before);
    expect(siblings(out)).toEqual([]);

    // Even a schema-1 manifest without spire-ui's marker is not proof enough.
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ schemaVersion: 1, items: {} }));
    fs.rmSync(path.join(out, "index.html"));
    const again = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [32], kinds: ["relic"], fonts: false }).catch((e: unknown) => e);
    expect((again as ExtractError).code).toBe("out-not-replaceable");
    expect(fs.readFileSync(path.join(out, "relic", "mine.txt"), "utf8")).toBe("user data");
  });

  test("refuses a previous output that now also holds a user's file", async () => {
    const game = await fakeGame();
    const out = outDir("stray");
    const pck = path.join(game, PCK_NAME);
    await extract({ pck, out, sizes: [32], kinds: ["relic"], fonts: false });
    fs.writeFileSync(path.join(out, "notes.md"), "keep me");
    const before = snapshot(out);
    const err = await extract({ pck, out, sizes: [32], kinds: ["relic"], fonts: false }).catch((e: unknown) => e);
    expect((err as ExtractError).code).toBe("out-not-replaceable");
    expect((err as Error).message).toContain("notes.md");
    expect(snapshot(out)).toEqual(before);
    expect(siblings(out)).toEqual([]);
  });

  test.skipIf(process.getuid?.() === 0)("a previous output that cannot be deleted is left with a warning, not a failure", async () => {
    const game = await fakeGame();
    const out = outDir("stuck");
    const pck = path.join(game, PCK_NAME);
    await extract({ pck, out, sizes: [32], kinds: ["relic"], fonts: false });
    fs.chmodSync(path.join(out, "relic"), 0o555); // its files cannot be unlinked
    const warnings: string[] = [];
    try {
      await extract({ pck, out, sizes: [16], kinds: ["relic"], fonts: false, warn: (m) => warnings.push(m) });
      expect(fs.existsSync(path.join(out, "relic/anchor@16.webp"))).toBe(true);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/could not remove the previous output at .*\.old-/);
    } finally {
      for (const s of siblings(out)) {
        fs.chmodSync(path.join(path.dirname(out), s, "relic"), 0o755);
        fs.rmSync(path.join(path.dirname(out), s), { recursive: true, force: true });
      }
    }
  });

  test("refuses packs from another engine major version", async () => {
    const dir = path.join(tmp, "godot3");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, PCK_NAME), buildPck({ engine: [3, 5, 0], files: await gameFiles() }));
    const err = await extract({ pck: path.join(dir, PCK_NAME), out: outDir("godot3"), sizes: [32], kinds: ["relic"], fonts: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).code).toBe("unsupported-game");
  });
});

describe("mapIds", () => {
  test("maps ids to their textures: plain image, then atlas sprite, then beta art", async () => {
    const files = await gameFiles();
    files.push(
      { path: "images/atlases/relic_atlas.sprites/anchor.tres", data: atlasTres("images/atlases/relic_atlas.png", 0, 0, 8, 8) },
      // Beta art: used only when nothing else exists.
      { path: "images/relics/beta/ring_of_the_snake.png.import", data: importFile(".godot/imported/beta.ctex") },
      { path: "images/relics/beta/missing_relic.png.import", data: importFile(".godot/imported/beta.ctex") },
      { path: ".godot/imported/beta.ctex", data: pngCtex(await solidPng(8, 8, [1, 2, 3]), 8, 8) },
      { path: "images/ui/top_panel/character_icon_ironclad.png.import", data: importFile(".godot/imported/ironclad.ctex") },
      { path: ".godot/imported/ironclad.ctex", data: pngCtex(await solidPng(8, 8, [1, 2, 3]), 8, 8) },
      { path: "localization/eng/characters.json", data: Buffer.from(JSON.stringify({ "IRONCLAD.title": "The Brawler" })) },
      { path: "images/ui/run_history/monster.png.import", data: importFile(".godot/imported/monster.ctex") },
      { path: "images/atlases/ui_atlas.sprites/map/icons/map_monster.tres", data: atlasTres("images/atlases/ui_atlas_0.png", 0, 0, 8, 8) },
      { path: ".godot/imported/monster.ctex", data: pngCtex(await solidPng(8, 8, [1, 2, 3]), 8, 8) },
      { path: "images/atlases/ui_atlas.sprites/top_bar/top_bar_gold.tres", data: atlasTres("images/atlases/ui_atlas_0.png", 0, 0, 8, 8) },
      { path: "images/atlases/ui_atlas.sprites/top_bar/top_bar_deck.tres", data: atlasTres("images/atlases/ui_atlas_0.png", 0, 0, 8, 8) },
      { path: "images/atlases/ui_atlas_0.png.import", data: importFile(".godot/imported/ui_atlas.ctex") },
      { path: ".godot/imported/ui_atlas.ctex", data: pngCtex(await solidPng(8, 8, [1, 2, 3]), 8, 8) },
    );
    const file = path.join(tmp, "map.pck");
    fs.writeFileSync(file, buildPck({ files }));
    const index = await readPckIndex(file);
    const ids = await mapIds(index, (e) => readPckFile(file, e));

    expect(ids.get("RELIC.ANCHOR")?.texture?.entry.path).toBe(".godot/imported/anchor.png-1.bptc.ctex");
    expect(ids.get("RELIC.ANCHOR")?.texture?.region).toBeUndefined();
    expect(ids.get("RELIC.RING_OF_THE_SNAKE")?.texture).toMatchObject({ entry: { path: ".godot/imported/relic_atlas.png-2.ctex" }, region: { x: 10, y: 20, w: 70, h: 60 } });
    expect(ids.get("RELIC.MISSING_RELIC")).toMatchObject({ name: "Missing Relic", texture: { entry: { path: ".godot/imported/beta.ctex" } } });
    expect(ids.get("CHARACTER.IRONCLAD")).toMatchObject({ kind: "class", slug: "ironclad", name: "The Brawler", texture: { entry: { path: ".godot/imported/ironclad.ctex" } } });
    expect(ids.get("CHARACTER.SILENT")).toMatchObject({ texture: null });
    expect(ids.get("ROOM.MONSTER")?.texture?.entry.path).toBe(".godot/imported/monster.ctex");
    expect(ids.get("STAT.GOLD")).toMatchObject({ kind: "ui", slug: "gold", texture: { entry: { path: ".godot/imported/ui_atlas.ctex" } } });
    expect(ids.get("STAT.DECK")).toMatchObject({ kind: "ui", slug: "deck", texture: { entry: { path: ".godot/imported/ui_atlas.ctex" } } });
    expect(ids.has("CARD.ANYTHING")).toBe(false);
    for (const [id, m] of ids) {
      expect(id).toMatch(/^[A-Z]+\.[A-Z0-9_]+$/);
      expect(m.slug).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  test("only the requested kinds are mapped", async () => {
    const file = path.join(tmp, "kinds.pck");
    fs.writeFileSync(file, buildPck({ files: await gameFiles() }));
    const index = await readPckIndex(file);
    const ids = await mapIds(index, (e) => readPckFile(file, e), ["potion"]);
    expect([...ids.keys()]).toEqual(["POTION.FIRE_POTION"]);
  });
});

describe("godot helpers", () => {
  test("plainText strips markup, resolves plurals and marks runtime values", () => {
    expect(plainText("Whenever you wave, gain [blue]{Amount}[/blue] [gold]Cheer[/gold].")).toBe("Whenever you wave, gain X Cheer.");
    expect(plainText("Hold [blue]{Hats}[/blue] {Hats:plural:hat|hats}.")).toBe("Hold X hats.");
    expect(plainText("Deal [img]res://x.png[/img]damage\n  now")).toBe("Deal damage now");
    // Untrusted strings are cut before the regexes run.
    expect(plainText(`[img]${"x".repeat(100_000)}`).length).toBeLessThanOrEqual(8 * 1024);
  });

  test("unwrapRscc inflates zstd and deflate blocks and checks sizes", () => {
    const plain = Buffer.from("x".repeat(10_000) + "end");
    expect(unwrapRscc(rscc(plain, 2, 4096, zstdStored)).equals(plain)).toBe(true);
    expect(unwrapRscc(rscc(plain, 1, 4096, (b) => deflateSync(b))).equals(plain)).toBe(true);
    expect(unwrapRscc(Buffer.from("plain")).toString()).toBe("plain");
    const lying = rscc(plain, 2, 4096, zstdStored);
    lying.writeUInt32LE(plain.length + 5000, 12);
    expect(() => unwrapRscc(lying)).toThrow();
    expect(() => unwrapRscc(rscc(plain, 2, 4096, zstdStored).subarray(0, 100))).toThrow();
  });

  test("embeddedSfnt finds a font inside a resource by its own table directory", () => {
    const font = fakeSfnt();
    const res = Buffer.concat([Buffer.from("RSRC junk \x00\x01\x00\x00 not a font"), font, Buffer.from("trailing cache data")]);
    expect(embeddedSfnt(res)?.equals(font)).toBe(true);
    expect(embeddedSfnt(Buffer.from("no font here"))).toBeNull();
  });
});

describe("card stats", () => {
  // Invented card text in the game's localization format; the cards match test/game-assembly.ts.
  const cardsJson = {
    "HAMMER_TEST.title": "Test Hammer",
    "HAMMER_TEST.description": "Bonk for {Damage:diff()}.",
    "SPARK_TEST.title": "Test Sparks",
    "SPARK_TEST.description": "Toss {Cards:diff()} [gold]{Cards:plural:spark|sparks}[/gold] at the [gold]moon[/gold].",
    "CURSE_TEST.title": "Test Curse",
    "CURSE_TEST.description": "Unplayable.",
  };

  /** A game with two card portraits (a 500x380 image and a 100x80 atlas sprite) and, optionally, its code. */
  async function cardGame(dll: Buffer | null): Promise<string> {
    const dir = path.join(tmp, `cards-${n++}`);
    fs.mkdirSync(dir);
    const files: FakeFile[] = [
      { path: "localization/eng/cards.json", data: Buffer.from(JSON.stringify(cardsJson)) },
      { path: "images/packed/card_portraits/crimson/hammer_test.png.import", data: importFile(".godot/imported/hammer_test.png-1.ctex") },
      { path: ".godot/imported/hammer_test.png-1.ctex", data: pngCtex(await solidPng(500, 380, [200, 30, 30]), 500, 380) },
      { path: "images/atlases/card_atlas.sprites/crimson/spark_test.tres", data: atlasTres("images/atlases/card_atlas.png", 4, 8, 100, 80) },
      { path: "images/atlases/card_atlas.png.import", data: importFile(".godot/imported/card_atlas.png-2.ctex") },
      { path: ".godot/imported/card_atlas.png-2.ctex", data: pngCtex(await solidPng(128, 128, [30, 200, 30]), 128, 128) },
    ];
    fs.writeFileSync(path.join(dir, PCK_NAME), buildPck({ files }));
    if (dll) {
      fs.mkdirSync(path.join(dir, "data_sts2_test_x86_64"));
      fs.writeFileSync(path.join(dir, "data_sts2_test_x86_64", "sts2.dll"), dll);
    }
    return dir;
  }

  test("--kinds card adds each card's stats and text from the game's code, and the resolver keeps them", async () => {
    const game = await cardGame(buildGameAssembly());
    const out = outDir("cards");
    const warnings: string[] = [];
    const summary = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [64, 256], kinds: ["card"], fonts: false, warn: (m) => warnings.push(m) });
    expect(warnings).toEqual([]);
    expect(summary.cardStats).toEqual({ cards: 2, withUnknown: [] });
    expect(summary.unmapped).toEqual(["CARD.CURSE_TEST"]);

    const raw = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.items["CARD.HAMMER_TEST"]).toEqual({
      kind: "card",
      file: "card/hammer_test@256.webp",
      w: 256,
      h: 195,
      name: "Test Hammer",
      description: "Bonk for X.",
      card: {
        cost: 1,
        type: "Attack",
        rarity: "Basic",
        target: "AnyEnemy",
        pool: "crimson",
        frame: "frame_crimson",
        vars: { Damage: { base: 6, upgraded: 9 } },
        description: "Bonk for 6.",
        upgradedDescription: "Bonk for 9.",
      },
    });
    // An atlas sprite smaller than the requested size keeps its own size: never upscaled.
    expect(raw.items["CARD.SPARK_TEST"]).toMatchObject({ file: "card/spark_test@256.webp", w: 100, h: 80, card: { description: "Toss 3 sparks at the moon.", upgradedDescription: "Toss 4 sparks at the moon." } });
    const small = await sharp(path.join(out, "card/hammer_test@64.webp")).metadata();
    expect([small.width, small.height]).toEqual([64, 49]);

    const manifest = parseManifest(raw);
    expect(manifest!.items["CARD.HAMMER_TEST"]).toEqual(raw.items["CARD.HAMMER_TEST"]);
    expect(resolveAsset("CARD.SPARK_TEST", manifest, "/spire")).toMatchObject({ source: "extracted", card: { cost: 1, keywords: ["Fleeting"], vars: { Cards: { base: 3, upgraded: 4 } } } });
  });

  test("without readable game code, cards still get their art (with a warning) and no stats", async () => {
    for (const dll of [null, Buffer.from("MZ not really an assembly".padEnd(200, "."))]) {
      const game = await cardGame(dll);
      const out = outDir("nocode");
      const warnings: string[] = [];
      const summary = await extract({ pck: path.join(game, PCK_NAME), out, sizes: [64], kinds: ["card"], fonts: false, warn: (m) => warnings.push(m) });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(dll ? /card stats skipped: .*sts2\.dll is not a game build/ : /card stats skipped: the game's sts2\.dll was not found/);
      expect(summary.cardStats).toBeNull();
      expect(summary.counts.card).toBe(2);
      const items = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")).items;
      expect(Object.values(items).some((i) => "card" in (i as object))).toBe(false);
    }
  });

  test("a build whose card model changed is reported as unsupported, art unaffected", async () => {
    const game = await cardGame(buildGameAssembly({ changedCardModelCtor: true }));
    const warnings: string[] = [];
    const summary = await extract({ pck: path.join(game, PCK_NAME), out: outDir("unsupported"), sizes: [64], kinds: ["card"], fonts: false, warn: (m) => warnings.push(m) });
    expect(warnings.join("\n")).toMatch(/not a game build this version understands \(CardModel/);
    expect(summary.counts.card).toBe(2);
  });

  test("assembly: null, or kinds without card, never reads the game's code", async () => {
    const game = await cardGame(Buffer.from("garbage"));
    const warnings: string[] = [];
    const a = await extract({ pck: path.join(game, PCK_NAME), out: outDir("skip"), sizes: [64], kinds: ["card"], fonts: false, assembly: null, warn: (m) => warnings.push(m) });
    const b = await extract({ pck: path.join(game, PCK_NAME), out: outDir("skip"), sizes: [64], kinds: ["relic"], fonts: false, warn: (m) => warnings.push(m) });
    expect([a.cardStats, b.cardStats, warnings]).toEqual([null, null, []]);
  });
});
