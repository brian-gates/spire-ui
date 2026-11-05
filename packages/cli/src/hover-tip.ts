// The game's hover tip panel (scenes/ui/hover_tip.tscn): the texture its `Bg` NinePatchRect
// stretches, written as the `UI.HOVER_TIP` ui item, and the nine-slice borders it stretches it by.
//
// The scene's region (339 x 107) is larger than the texture it draws (320 x 96 in the current
// game); Godot samples past the texture's edge as its transparent edge pixels, so the visible panel
// is the texture itself and the right and bottom borders the texture holds are the scene's minus
// that overhang. `hoverTipSlice` works that out from the decoded texture size.
import type { NineSlice } from "./manifest";

export const HOVER_TIP_ID = "UI.HOVER_TIP";
export const HOVER_TIP_SCENE = "scenes/ui/hover_tip.tscn";
export const HOVER_TIP_IMAGE = "images/ui/hover_tip.png";

/** The `Bg` NinePatchRect: its region in the texture and its patch margins, in texture pixels. */
export interface HoverTipPatch {
  region: { x: number; y: number; w: number; h: number };
  margins: NineSlice;
}

/** The Bg node's region and patch margins from hover_tip.tscn; null when the scene is not that shape. */
export function parseHoverTipScene(tscn: string): HoverTipPatch | null {
  const block = tscn
    .slice(0, 1 << 20)
    .split(/\n(?=\[)/)
    .find((b) => /^\[node name="Bg" type="NinePatchRect"/.test(b));
  if (!block) return null;
  const r = /^region_rect = Rect2\((-?[\d.]+), (-?[\d.]+), ([\d.]+), ([\d.]+)\)\s*$/m.exec(block);
  const margin = (k: string) => {
    const m = new RegExp(`^patch_margin_${k} = (\\d+)\\s*$`, "m").exec(block);
    return m ? Number(m[1]) : 0;
  };
  const region = r ? { x: Number(r[1]), y: Number(r[2]), w: Number(r[3]), h: Number(r[4]) } : null;
  if (!region || !Object.values(region).every((n) => Number.isFinite(n) && Math.abs(n) <= 4096) || region.w <= 0 || region.h <= 0) return null;
  const margins = { left: margin("left"), top: margin("top"), right: margin("right"), bottom: margin("bottom") };
  if (!Object.values(margins).every((n) => Number.isSafeInteger(n) && n <= 4096)) return null;
  return { region, margins };
}

/**
 * The borders in the texture's own pixels (`w` x `h`), or null unless the region starts at the
 * texture's origin and every border is positive and leaves a centre.
 */
export function hoverTipSlice(patch: HoverTipPatch, w: number, h: number): NineSlice | null {
  const { region, margins } = patch;
  if (region.x !== 0 || region.y !== 0) return null;
  const s = {
    left: margins.left,
    top: margins.top,
    right: margins.right - Math.max(0, region.w - w),
    bottom: margins.bottom - Math.max(0, region.h - h),
  };
  if (!Object.values(s).every((n) => Number.isInteger(n) && n > 0) || s.left + s.right >= w || s.top + s.bottom >= h) return null;
  return s;
}
