// Card pieces: the hsv.gdshader tint, material and card scene parsing, id mapping and extraction,
// all on synthetic inputs (invented scene text and solid-colour textures; nothing from the game).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, test } from "vitest";
import { parseManifest, resolveAsset } from "../../../registry/spire/lib/assets";
import { CARD_PIECES, hsvTint, parseCardLayout, parseHsvMaterial, pieceBoxes } from "../src/card-pieces";
import { extract, mapIds } from "../src/extract";
import { parseAtlasTres } from "../src/godot";
import { readPckFile, readPckIndex } from "../src/pck";
import { buildPck, type FakeFile, importFile, pngCtex, solidPng } from "./fixtures";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spire-pieces-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const tint = (rgb: [number, number, number], p: { h: number; s: number; v: number }) => {
  const px = new Uint8Array([...rgb, 200]);
  hsvTint(px, p);
  return [...px];
};

describe("hsvTint (hsv.gdshader)", () => {
  test("h = 1, s = 1, v = 1 leaves a colour as it is; alpha is never touched", () => {
    expect(tint([200, 40, 60], { h: 1, s: 1, v: 1 })).toEqual([200, 40, 60, 200]);
    expect(tint([200, 40, 60], { h: 0, s: 1, v: 1 })).toEqual([200, 40, 60, 200]);
  });

  test("s = 0 keeps only YIQ luma, so any colour becomes grey of the same luma", () => {
    const [r, g, b] = tint([200, 40, 60], { h: 0.3, s: 0, v: 1 });
    const luma = Math.round(0.2989 * 200 + 0.587 * 40 + 0.114 * 60);
    expect([r, g, b]).toEqual([luma, luma, luma]);
  });

  test("v scales everything; values clamp to 0-255", () => {
    expect(tint([100, 100, 100], { h: 1, s: 1, v: 0.5 })).toEqual([50, 50, 50, 200]);
    expect(tint([200, 200, 200], { h: 1, s: 1, v: 2 })).toEqual([255, 255, 255, 200]);
  });

  test("hue turns by (1 - h): half a turn sends red towards cyan, and a full one back", () => {
    const [r, g, b] = tint([150, 90, 90], { h: 0.5, s: 1, v: 1 });
    expect(r).toBeLessThan(g!);
    expect(r).toBeLessThan(b!);
    // Luma is unchanged by a hue turn (while nothing clamps).
    expect(Math.abs(0.2989 * r! + 0.587 * g! + 0.114 * b! - (0.2989 * 150 + 0.587 * 90 + 0.114 * 90))).toBeLessThan(2);
    // A quarter turn one way, then three quarters, is a full turn.
    const px = new Uint8Array([150, 90, 90, 255]);
    hsvTint(px, { h: 0.75, s: 1, v: 1 });
    hsvTint(px, { h: 0.25, s: 1, v: 1 });
    expect([...px].map((c, i) => Math.abs(c - [150, 90, 90, 255][i]!))).toSatisfy((d: number[]) => d.every((x) => x <= 2));
  });
});

describe("parsers", () => {
  test("parseHsvMaterial reads h, s, v from an hsv.gdshader material; the shader's defaults fill gaps", () => {
    const mat = (body: string, shader = "res://shaders/hsv.gdshader") =>
      `[gd_resource type="ShaderMaterial" load_steps=2 format=3]\n\n[ext_resource type="Shader" path="${shader}" id="1"]\n\n[resource]\nshader = ExtResource("1")\n${body}`;
    expect(parseHsvMaterial(mat("shader_parameter/h = 0.32\nshader_parameter/s = 0.45\nshader_parameter/v = 1.2\n"))).toEqual({ h: 0.32, s: 0.45, v: 1.2 });
    expect(parseHsvMaterial(mat("shader_parameter/s = 0.0\n"))).toEqual({ h: 1, s: 0, v: 1 });
    expect(parseHsvMaterial(mat("shader_parameter/h = 0.3\n", "res://shaders/other.gdshader"))).toBeNull();
    expect(parseHsvMaterial(mat("shader_parameter/v = 1e300\n"))).toBeNull();
  });

  test("parseAtlasTres keeps a sprite's trim margin, and ignores an implausible one", () => {
    const tres = (margin: string) => `[ext_resource type="Texture2D" path="res://a.png" id="1"]\nregion = Rect2(1, 2, 30, 40)\n${margin}`;
    expect(parseAtlasTres(tres("margin = Rect2(1, 23, 2, 25)\n"))).toEqual({ atlas: "a.png", region: { x: 1, y: 2, w: 30, h: 40 }, margin: { x: 1, y: 23, w: 2, h: 25 } });
    expect(parseAtlasTres(tres(""))).toEqual({ atlas: "a.png", region: { x: 1, y: 2, w: 30, h: 40 } });
    // Offset larger than the extra size: not a margin.
    expect(parseAtlasTres(tres("margin = Rect2(9, 0, 2, 0)\n"))?.margin).toBeUndefined();
  });

  test("parseCardLayout reads node boxes relative to the frame, and label font sizes into their box", () => {
    const layout = parseCardLayout(SCENE);
    expect(layout).toEqual({
      w: 300,
      h: 422,
      boxes: {
        frame: { x: 0, y: 0, w: 300, h: 422 },
        portrait: { x: 25, y: 43, w: 250, h: 190 },
        portraitBorder: { x: 12.5, y: 47, w: 275, h: 210 },
        banner: { x: -13, y: 4, w: 327, h: 83 },
        title: { x: 45, y: 7, w: 210, h: 54, fontSize: 26 },
        plaque: { x: 119.5, y: 212, w: 61, h: 37, fontSize: 16 },
        orb: { x: -16, y: -16, w: 64, h: 64, fontSize: 32 },
        star: { x: -36, y: 22, w: 58, h: 58, fontSize: 22 },
        text: { x: 28, y: 248, w: 243, h: 136, fontSize: 21 },
      },
    });
    expect(parseCardLayout(SCENE.replace('name="Frame"', 'name="Framed"'))).toBeNull();
    expect(parseCardLayout(SCENE.replace("offset_right = -102.0", "offset_right = -500.0"))).toBeNull();
  });
});

/** Invented card scene text in Godot's format, with the boxes the game's scene happens to use. */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const node = (name: string, parent: string, [l, t, r, b]: number[], extra = "") =>
  `[node name="${name}" type="TextureRect" parent="${parent}"]\nlayout_mode = 1\noffset_left = ${f(l!)}\noffset_top = ${f(t!)}\noffset_right = ${f(r!)}\noffset_bottom = ${f(b!)}\n${extra}`;
const SCENE = [
  '[gd_scene load_steps=2 format=3]\n\n[node name="Card" type="Control"]\n',
  '[node name="CardContainer" type="Control" parent="."]\n',
  '[node name="PortraitCanvasGroup" type="CanvasGroup" parent="CardContainer"]\n',
  node("Portrait", "CardContainer/PortraitCanvasGroup", [-125, -168, 125, 22]),
  node("Frame", "CardContainer", [-150, -211, 150, 211]),
  node("DescriptionLabel", "CardContainer", [-122, 37, 121, 173], "theme_override_font_sizes/normal_font_size = 21\n"),
  node("PortraitBorder", "CardContainer", [-137.5, -164, 137.5, 46]),
  node("TitleBanner", "CardContainer", [-163, -207, 164, -124]),
  node("TitleLabel", "CardContainer", [-105, -204, 105, -150], "theme_override_font_sizes/font_size = 26\n"),
  node("TypePlaque", "CardContainer", [-30.5, 1, 30.5, 38]),
  node("TypeLabel", "CardContainer/TypePlaque", [-22, -14, 22, 14], "theme_override_font_sizes/font_size = 16\n"),
  node("EnergyIcon", "CardContainer", [-166, -227, -102, -163]),
  node("EnergyLabel", "CardContainer/EnergyIcon", [-23, -26, 23, 30], "theme_override_font_sizes/font_size = 32\n"),
  node("StarIcon", "CardContainer", [-186, -189, -128, -131]),
  node("StarLabel", "CardContainer/StarIcon", [-14, -20, 14, 20], "theme_override_font_sizes/font_size = 22\n"),
].join("\n");

describe("extracting card pieces", () => {
  const mat = (h: number, s: number, v: number) => Buffer.from(`[ext_resource type="Shader" path="res://shaders/hsv.gdshader" id="1"]\n[resource]\nshader_parameter/h = ${h}\nshader_parameter/s = ${s}\nshader_parameter/v = ${v}\n`);
  const sprite = (x: number, y: number, w: number, h: number, margin = "") =>
    Buffer.from(`[ext_resource type="Texture2D" path="res://images/atlases/ui_atlas_0.png" id="1"]\n[resource]\nregion = Rect2(${x}, ${y}, ${w}, ${h})\n${margin}`);

  /** A 200x200 atlas: a red 120x160 "frame", a cyan 100x20 "banner" and a 20x20 orb. */
  async function game(o: { noMaterial?: boolean } = {}): Promise<string> {
    const atlas = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([
        { input: await solidPng(120, 160, [200, 40, 40]), left: 0, top: 0 },
        { input: await solidPng(60, 20, [60, 200, 220]), left: 130, top: 0 },
        { input: await solidPng(20, 20, [250, 120, 20]), left: 130, top: 40 },
      ])
      .png()
      .toBuffer();
    const S = "images/atlases/ui_atlas.sprites/card";
    const files: FakeFile[] = [
      { path: "images/atlases/ui_atlas_0.png.import", data: importFile(".godot/imported/ui_atlas_0.png-1.ctex", "path") },
      { path: ".godot/imported/ui_atlas_0.png-1.ctex", data: pngCtex(atlas, 200, 200) },
      { path: `${S}/card_frame_attack_s.tres`, data: sprite(0, 0, 120, 160) },
      { path: `${S}/card_banner.tres`, data: sprite(130, 0, 60, 20, "margin = Rect2(2, 6, 4, 8)\n") },
      { path: `${S}/energy_ironclad.tres`, data: sprite(130, 40, 20, 20) },
      { path: "materials/cards/frames/card_frame_red_mat.tres", data: mat(1, 1, 1) },
      { path: "materials/cards/banners/card_banner_common_mat.tres", data: mat(1, 0, 1) },
      { path: "scenes/cards/card.tscn", data: Buffer.from(SCENE) },
    ];
    if (!o.noMaterial) files.push({ path: "materials/cards/frames/card_frame_green_mat.tres", data: mat(0.5, 1, 1) });
    const dir = fs.mkdtempSync(path.join(tmp, "game-"));
    fs.writeFileSync(path.join(dir, "Slay the Spire 2.pck"), buildPck({ files }));
    return path.join(dir, "Slay the Spire 2.pck");
  }

  test("ids are stable and every slug is a safe file name", () => {
    const ids = CARD_PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("UI.CARD_FRAME.ATTACK.RED");
    expect(ids).toContain("UI.CARD_FRAME.QUEST.QUEST");
    expect(ids).toContain("UI.CARD_BANNER.RARE");
    expect(ids).toContain("UI.CARD_PORTRAIT_BORDER.POWER.UNCOMMON");
    expect(ids).toContain("UI.CARD_PLAQUE.COMMON");
    expect(ids).toContain("UI.CARD_ORB.SILENT");
    expect(ids).toContain("UI.CARD_STAR");
    for (const p of CARD_PIECES) expect(p.slug).toMatch(/^[a-z0-9_-]+$/);
    expect(CARD_PIECES.find((p) => p.id === "UI.CARD_FRAME.SKILL.GREEN")!.slug).toBe("card_frame-skill-green");
    expect(pieceBoxes(598, 844)).toEqual([211, 422, 844]);
    expect(pieceBoxes(2, 2)).toEqual([1, 2]);
  });

  test("mapIds: pieces map with their material's tint; a missing material leaves the piece unmapped", async () => {
    const pck = await game({ noMaterial: true });
    const index = await readPckIndex(pck);
    const ids = await mapIds(index, (e) => readPckFile(pck, e), ["ui"]);
    expect(ids.get("UI.CARD_FRAME.ATTACK.RED")).toMatchObject({ kind: "ui", slug: "card_frame-attack-red", piece: { tint: { h: 1, s: 1, v: 1 } } });
    expect(ids.get("UI.CARD_FRAME.ATTACK.RED")!.texture).not.toBeNull();
    expect(ids.get("UI.CARD_FRAME.ATTACK.GREEN")!.texture).toBeNull();
    expect(ids.get("UI.CARD_ORB.IRONCLAD")).toMatchObject({ piece: {} });
    expect(ids.get("UI.CARD_ORB.IRONCLAD")!.texture).not.toBeNull();
    // Not asked for ui: no pieces.
    expect([...(await mapIds(index, (e) => readPckFile(pck, e), ["relic"])).keys()].some((k) => k.startsWith("UI."))).toBe(false);
  });

  test("writes tinted pieces at 1/4, 1/2 and 1x, margins restored, plus the card layout", async () => {
    const pck = await game();
    const out = path.join(tmp, "out-pieces", "spire");
    const warnings: string[] = [];
    const summary = await extract({ pck, out, sizes: [64], kinds: ["ui"], fonts: false, warn: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")))!;
    expect(manifest.cardLayout).toEqual(parseCardLayout(SCENE));

    // --sizes 64 does not apply: a 120x160 frame is written 30, 60 and 120 wide.
    expect(manifest.items["UI.CARD_FRAME.ATTACK.RED"]).toMatchObject({ kind: "ui", file: "ui/card_frame-attack-red@120.webp", w: 120, h: 160, widths: [30, 60, 120] });
    expect(resolveAsset("UI.CARD_FRAME.ATTACK.GREEN", manifest, "/a").source).toBe("extracted");
    // The banner: 60x20 plus its 4x8 margin.
    expect(manifest.items["UI.CARD_BANNER.COMMON"]).toMatchObject({ w: 64, h: 28 });
    const banner = await sharp(path.join(out, "ui/card_banner-common@64.webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...banner.data.subarray((y * banner.info.width + x) * 4, (y * banner.info.width + x) * 4 + 4)];
    expect(at(0, 0)[3]).toBe(0); // margin: transparent
    const [r, g, b, a] = at(30, 15);
    expect(a).toBe(255);
    // Common banner material: s = 0, so the cyan becomes grey.
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(6);

    // Green frame material (h = 0.5): the red frame turns cyan-ish.
    const green = await sharp(path.join(out, "ui/card_frame-attack-green@30.webp")).ensureAlpha().raw().toBuffer();
    const [gr, gg, gb] = [...green.subarray((20 * 30 + 15) * 4, (20 * 30 + 15) * 4 + 3)];
    expect(gr!).toBeLessThan(gg!);
    expect(gr!).toBeLessThan(gb!);
    // Untinted orb.
    expect(manifest.items["UI.CARD_ORB.IRONCLAD"]).toMatchObject({ w: 20, h: 20, widths: [5, 10, 20] });
    // Pieces the game files lack are named as unmapped.
    expect(summary.unmapped).toContain("UI.CARD_STAR");
    expect(summary.unmapped).not.toContain("UI.CARD_FRAME.ATTACK.RED");
  });
});
