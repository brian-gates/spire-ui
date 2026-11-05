// The pieces the game draws a card from (scenes/cards/card.tscn), as `ui` items, tinted the way the
// game tints them, plus the card scene's layout so a page can put them back together.
//
// How the game colours a card: the frame, banner, portrait border and type plaque textures are
// painted in one base colour (frames red, banners and borders cyan) and drawn through
// shaders/hsv.gdshader, whose `h`, `s`, `v` parameters come from a material per frame colour
// (materials/cards/frames/card_frame_<colour>_mat.tres, the card pool's CardFrameMaterialPath) or per
// rarity (materials/cards/banners/card_banner_<rarity>_mat.tres, for the title banner and portrait
// border). The shader rotates hue in YIQ space, scales chroma by `s` and everything by `v`;
// `hsvTint` is the same arithmetic on 8-bit sRGB pixels (Godot's 2D renderer shades in sRGB).
// The energy orbs are already coloured per character and drawn as they are.
//
// The description panel is part of the frame texture (its dark lower half); there is no separate
// texture for it.

/** The hsv.gdshader parameters of one material. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** `h`, `s` and `v` from a ShaderMaterial `.tres` using shaders/hsv.gdshader; null for anything else. */
export function parseHsvMaterial(text: string): Hsv | null {
  if (!/path="res:\/\/shaders\/hsv\.gdshader"/.test(text)) return null;
  const param = (k: string, fallback: number) => {
    const m = new RegExp(`^shader_parameter/${k} = (-?[\\d.]+(?:e-?\\d+)?)\\s*$`, "m").exec(text);
    return m ? Number(m[1]) : fallback;
  };
  // Defaults are the shader's own: h = 1 (no rotation), s = 1, v = 1.
  const out = { h: param("h", 1), s: param("s", 1), v: param("v", 1) };
  return Object.values(out).every((n) => Number.isFinite(n) && Math.abs(n) <= 16) ? out : null;
}

// RGB -> YIQ as the shader writes it (GLSL mat3 columns), and its inverse.
const YIQ = [
  [0.2989, 0.587, 0.114],
  [0.5959, -0.2774, -0.3216],
  [0.2115, -0.5229, 0.3114],
];
function invert3(m: number[][]): number[][] {
  const [a, b, c] = m[0]!;
  const [d, e, f] = m[1]!;
  const [g, h, i] = m[2]!;
  const A = e! * i! - f! * h!;
  const B = -(d! * i! - f! * g!);
  const C = d! * h! - e! * g!;
  const det = a! * A + b! * B + c! * C;
  return [
    [A / det, -(b! * i! - c! * h!) / det, (b! * f! - c! * e!) / det],
    [B / det, (a! * i! - c! * g!) / det, -(a! * f! - c! * d!) / det],
    [C / det, -(a! * h! - b! * g!) / det, (a! * e! - b! * d!) / det],
  ];
}
const RGB = invert3(YIQ);

/**
 * Applies hsv.gdshader to RGBA pixels in place: YIQ, rotate (I, Q) by (1 - h) turns, scale them
 * by s, scale all three by v, back to RGB, clamped. Alpha is unchanged.
 */
export function hsvTint(rgba: Uint8Array, p: Hsv): void {
  const turn = (1 - p.h) * 2 * Math.PI;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const clamp = (x: number) => (x <= 0 ? 0 : x >= 255 ? 255 : Math.round(x));
  for (let o = 0; o + 3 < rgba.length; o += 4) {
    const r = rgba[o]! / 255;
    const g = rgba[o + 1]! / 255;
    const b = rgba[o + 2]! / 255;
    const y = YIQ[0]![0]! * r + YIQ[0]![1]! * g + YIQ[0]![2]! * b;
    const i0 = YIQ[1]![0]! * r + YIQ[1]![1]! * g + YIQ[1]![2]! * b;
    const q0 = YIQ[2]![0]! * r + YIQ[2]![1]! * g + YIQ[2]![2]! * b;
    // `col.rgb *= hue_shift` multiplies the row vector by the matrix: I' = cI - sQ, Q' = sI + cQ.
    const Y = y * p.v;
    const I = (cos * i0 - sin * q0) * p.s * p.v;
    const Q = (sin * i0 + cos * q0) * p.s * p.v;
    rgba[o] = clamp((RGB[0]![0]! * Y + RGB[0]![1]! * I + RGB[0]![2]! * Q) * 255);
    rgba[o + 1] = clamp((RGB[1]![0]! * Y + RGB[1]![1]! * I + RGB[1]![2]! * Q) * 255);
    rgba[o + 2] = clamp((RGB[2]![0]! * Y + RGB[2]![1]! * I + RGB[2]![2]! * Q) * 255);
  }
}

// --- which pieces -----------------------------------------------------------------------------

const CARD_SPRITES = "images/atlases/ui_atlas.sprites/card";

/** Frame colours: the suffix of a pool's CardFrameMaterialPath (`card.frame` in the manifest). */
export const FRAME_COLOURS = ["red", "green", "blue", "orange", "pink", "colorless", "curse", "quest"] as const;
/** Banner materials, named by card rarity. */
export const BANNER_RARITIES = ["common", "uncommon", "rare", "curse", "event", "quest", "status", "ancient"] as const;
/** Frame and portrait border shapes, by card type. */
export const SHAPES = ["attack", "skill", "power"] as const;
/** Energy orbs, by the character (or colour) the game names them after. */
export const ORBS = ["ironclad", "silent", "defect", "regent", "necrobinder", "colorless", "quest"] as const;

export interface CardPiece {
  id: string;
  /** Output slug: the id after `UI.` in lower case, dots as dashes. */
  slug: string;
  /** An atlas sprite `.tres` or a plain image path (resolved through its `.import`). */
  source: { sprite: string } | { image: string };
  /** Material whose hsv.gdshader parameters tint the texture; none: drawn as it is. */
  material?: string;
}

const piece = (id: string, source: CardPiece["source"], material?: string): CardPiece => ({
  id,
  slug: id.slice("UI.".length).toLowerCase().replaceAll(".", "-"),
  source,
  ...(material ? { material } : {}),
});
const frameMat = (c: string) => `materials/cards/frames/card_frame_${c}_mat.tres`;
const bannerMat = (r: string) => `materials/cards/banners/card_banner_${r}_mat.tres`;

/**
 * Every card piece, with ids:
 *  - UI.CARD_FRAME.<SHAPE>.<COLOUR>: attack/skill/power frame in each frame colour, plus
 *    UI.CARD_FRAME.QUEST.QUEST (quest cards' own frame). The frame includes the text panel.
 *  - UI.CARD_BANNER.<RARITY>: the title ribbon.
 *  - UI.CARD_PORTRAIT_BORDER.<SHAPE>.<RARITY>: the border round the portrait (banner-tinted, as the
 *    card scene draws it with the banner material).
 *  - UI.CARD_PLAQUE.<RARITY>: the type plaque (a nine-patch, left 26 / right 24 px at this 2x
 *    size), tinted like the portrait border it sits on.
 *  - UI.CARD_ORB.<CHARACTER>: the energy cost orb; UI.CARD_STAR: the Regent's star cost.
 */
export const CARD_PIECES: readonly CardPiece[] = [
  ...SHAPES.flatMap((t) => FRAME_COLOURS.map((c) => piece(`UI.CARD_FRAME.${t.toUpperCase()}.${c.toUpperCase()}`, { sprite: `${CARD_SPRITES}/card_frame_${t}_s.tres` }, frameMat(c)))),
  piece("UI.CARD_FRAME.QUEST.QUEST", { sprite: `${CARD_SPRITES}/card_frame_quest_s.tres` }, frameMat("quest")),
  ...BANNER_RARITIES.map((r) => piece(`UI.CARD_BANNER.${r.toUpperCase()}`, { sprite: `${CARD_SPRITES}/card_banner.tres` }, bannerMat(r))),
  ...SHAPES.flatMap((t) =>
    BANNER_RARITIES.map((r) => piece(`UI.CARD_PORTRAIT_BORDER.${t.toUpperCase()}.${r.toUpperCase()}`, { sprite: `${CARD_SPRITES}/card_portrait_border_${t}_s.tres` }, bannerMat(r))),
  ),
  ...BANNER_RARITIES.map((r) => piece(`UI.CARD_PLAQUE.${r.toUpperCase()}`, { sprite: `${CARD_SPRITES}/card_portrait_border_plaque_s.tres` }, bannerMat(r))),
  ...ORBS.map((c) => piece(`UI.CARD_ORB.${c.toUpperCase()}`, { sprite: `${CARD_SPRITES}/energy_${c}.tres` })),
  piece("UI.CARD_STAR", { image: "images/ui/combat/energy_star.png" }),
];

/**
 * Pieces are drawn at a fraction of the card, not as icons, so each is written at 1/4, 1/2 and 1x
 * of its own texture (the textures are 2x the card scene's 300 x 422 px). `--sizes` does not apply.
 */
export const PIECE_SCALES = [0.25, 0.5, 1] as const;

/** Longer-side boxes for a piece of `w` x `h`, ascending and distinct. */
export function pieceBoxes(w: number, h: number): number[] {
  const long = Math.max(w, h);
  return [...new Set(PIECE_SCALES.map((f) => Math.max(1, Math.round(long * f))))];
}

// --- layout ----------------------------------------------------------------------------------

export interface CardLayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The node's font size in card pixels, for text nodes. */
  fontSize?: number;
}

/** Where the card scene puts each piece, in its own pixels, with (0, 0) at the frame's top left. */
export interface CardLayout {
  /** The frame's size: 300 x 422 in the game. Other boxes may lie partly outside it. */
  w: number;
  h: number;
  boxes: Record<string, CardLayoutBox>;
}

/** Card scene node -> layout box name. */
const NODES: Record<string, string> = {
  Frame: "frame",
  Portrait: "portrait",
  PortraitBorder: "portraitBorder",
  TitleBanner: "banner",
  TitleLabel: "title",
  TypePlaque: "plaque",
  EnergyIcon: "orb",
  StarIcon: "star",
  DescriptionLabel: "text",
};
/** Labels drawn inside a node: their font size is that box's. */
const LABELS: Record<string, string> = { TypeLabel: "plaque", EnergyLabel: "orb", StarLabel: "star" };

/**
 * The layout from scenes/cards/card.tscn: each named node's offsets (all are positioned from the
 * card's centre), shifted so the Frame's top left is the origin. Null when the scene has no Frame
 * or any box is missing or implausible.
 */
export function parseCardLayout(tscn: string): CardLayout | null {
  const raw = new Map<string, CardLayoutBox>();
  const labelSizes = new Map<string, number>();
  const blocks = tscn.slice(0, 1 << 20).split(/\n(?=\[)/);
  for (const block of blocks) {
    const head = /^\[node name="([A-Za-z]+)" type="[A-Za-z]+" parent="CardContainer(?:\/[A-Za-z]+)?"\]/.exec(block);
    const label = head && LABELS[head[1]!];
    const labelSize = label && /^theme_override_font_sizes\/font_size = (\d+)\s*$/m.exec(block);
    if (label && labelSize) labelSizes.set(label, Number(labelSize[1]));
    const box = head && NODES[head[1]!];
    if (!box) continue;
    const num = (k: string) => {
      const m = new RegExp(`^${k} = (-?[\\d.]+)\\s*$`, "m").exec(block);
      return m ? Number(m[1]) : NaN;
    };
    const [l, t, r, b] = ["offset_left", "offset_top", "offset_right", "offset_bottom"].map(num) as [number, number, number, number];
    const size = /^theme_override_font_sizes\/(?:normal_)?font_size = (\d+)\s*$/m.exec(block);
    if (![l, t, r, b].every(Number.isFinite) || r <= l || b <= t) return null;
    raw.set(box, { x: l, y: t, w: r - l, h: b - t, ...(size ? { fontSize: Number(size[1]) } : {}) });
  }
  const frame = raw.get("frame");
  if (!frame || raw.size !== Object.keys(NODES).length) return null;
  const round = (n: number) => Math.round(n * 100) / 100;
  const boxes: Record<string, CardLayoutBox> = {};
  for (const [k, size] of labelSizes) {
    const b = raw.get(k);
    if (b) b.fontSize = size;
  }
  for (const [k, v] of raw) {
    if (Math.abs(v.x - frame.x) > frame.w * 2 || Math.abs(v.y - frame.y) > frame.h * 2 || v.w > frame.w * 2 || v.h > frame.h * 2) return null;
    boxes[k] = { x: round(v.x - frame.x), y: round(v.y - frame.y), w: round(v.w), h: round(v.h), ...(v.fontSize ? { fontSize: v.fontSize } : {}) };
  }
  return { w: frame.w, h: frame.h, boxes };
}
