import { describe, expect, test } from "vitest";
import { hoverTipSlice, parseHoverTipScene } from "../src/hover-tip";

// An invented scene in Godot's text format, shaped like the game's hover tip.
const scene = (bg: string) => `[gd_scene format=3]\n\n[node name="HoverTip" type="MarginContainer"]\noffset_right = 10.0\n\n${bg}\n\n[node name="Title" type="Label" parent="."]\n`;
const bg = (region: string) =>
  `[node name="Bg" type="NinePatchRect" parent="."]\nregion_rect = Rect2(${region})\npatch_margin_left = 30\npatch_margin_top = 20\npatch_margin_right = 40\npatch_margin_bottom = 16`;

describe("hover tip nine-slice", () => {
  test("reads the Bg node's region and margins", () => {
    expect(parseHoverTipScene(scene(bg("0, 0, 210, 70")))).toEqual({ region: { x: 0, y: 0, w: 210, h: 70 }, margins: { left: 30, top: 20, right: 40, bottom: 16 } });
  });

  test("borders past the texture's edge shrink by the overhang; a region that fits keeps them", () => {
    const patch = parseHoverTipScene(scene(bg("0, 0, 210, 70")))!;
    expect(hoverTipSlice(patch, 200, 64)).toEqual({ left: 30, top: 20, right: 30, bottom: 10 });
    expect(hoverTipSlice(patch, 210, 70)).toEqual({ left: 30, top: 20, right: 40, bottom: 16 });
  });

  test("shapes it does not understand give no slice rather than a wrong one", () => {
    expect(parseHoverTipScene(scene(""))).toBeNull();
    expect(parseHoverTipScene(scene(bg("a, b, c, d")))).toBeNull();
    // An offset region, borders eaten by the overhang, or no centre left.
    expect(hoverTipSlice(parseHoverTipScene(scene(bg("4, 0, 210, 70")))!, 200, 64)).toBeNull();
    expect(hoverTipSlice(parseHoverTipScene(scene(bg("0, 0, 210, 70")))!, 160, 64)).toBeNull();
    expect(hoverTipSlice(parseHoverTipScene(scene(bg("0, 0, 70, 70")))!, 70, 70)).toBeNull();
  });
});
