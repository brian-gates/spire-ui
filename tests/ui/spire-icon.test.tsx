// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpireAssets } from "../../registry/spire/lib/assets-provider";
import { FallbackIcon, fallbackKeyFor } from "../../registry/spire/icons/fallback";
import { SpireIcon } from "../../registry/spire/ui/spire-icon";
import type { SpireManifest } from "../../registry/spire/lib/assets";

afterEach(cleanup);

const manifest: SpireManifest = {
  schemaVersion: 1, gameVersion: "t", generatedAt: "t",
  items: {
    "RELIC.A": { kind: "relic", file: "relics/a.png", w: 64, h: 64, name: "Alpha" },
    "RELIC.B": { kind: "relic", file: "relics/b.png", w: 64, h: 64, name: "Beta" },
  },
};
const wrap = (ui: React.ReactNode) => render(<SpireAssets base="/art" manifest={manifest}>{ui}</SpireAssets>);

describe("SpireIcon", () => {
  it("renders an extracted img with alt, default size and lazy loading", () => {
    const { container } = wrap(<SpireIcon id="RELIC.A" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/art/relics/a.png");
    expect(img.alt).toBe("Alpha");
    expect(img.getAttribute("width")).toBe("32");
    expect(img.getAttribute("height")).toBe("32");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("honours size", () => {
    const { container } = wrap(<SpireIcon id="RELIC.A" size={48} />);
    expect(container.querySelector("img")!.getAttribute("width")).toBe("48");
  });

  it("swaps to the fallback svg on error, only for that icon", () => {
    const { container } = wrap(<><SpireIcon id="RELIC.A" /><SpireIcon id="RELIC.B" /></>);
    fireEvent.error(container.querySelectorAll("img")[0]);
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.querySelector("title")!.textContent).toBe("Alpha");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")!.alt).toBe("Beta");
  });

  it("renders a fallback with a tidied name for unknown ids", () => {
    const { container } = wrap(<SpireIcon id="POTION.FIRE_WATER" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg title")!.textContent).toBe("Fire Water");
  });

  it("works without a provider", () => {
    const { container } = render(<SpireIcon id="CARD.STRIKE" />);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });
});

describe("FallbackIcon", () => {
  it("uses a 24 viewBox and applies tint as color", () => {
    const { container } = render(<FallbackIcon k="relic" tint="red" title="x" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.style.color).toBe("red");
  });

  it("default-tints class keys with the class token", () => {
    const { container } = render(<FallbackIcon k="class.silent" title="x" />);
    expect(container.querySelector("svg")!.getAttribute("style")).toContain("var(--color-class-silent)");
  });

  it("renders every key with content", () => {
    const keys = ["relic","potion","card","class.ironclad","class.silent","class.defect","class.regent","class.necrobinder","class.unknown","room.monster","room.elite","room.rest","room.shop","room.treasure","room.event","room.boss","room.unknown","stat.hp","stat.gold","stat.energy"] as const;
    for (const k of keys) {
      const { container, unmount } = render(<FallbackIcon k={k} title={k} />);
      expect(container.querySelectorAll("path,circle,rect,ellipse,polygon").length, k).toBeGreaterThan(0);
      unmount();
    }
  });

  it("re-exports fallbackKeyFor", () => {
    expect(fallbackKeyFor("CHARACTER.REGENT")).toBe("class.regent");
    expect(fallbackKeyFor("CHARACTER.MODDED")).toBe("class.unknown");
  });
});
