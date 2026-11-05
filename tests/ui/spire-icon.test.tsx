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
    "RELIC.C": { kind: "relic", file: "relic/c@256.webp", w: 256, h: 256, widths: [64, 128, 256], name: "Gamma" },
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

  it("renders srcSet with sizes defaulting to its CSS size, keeping src as the largest", () => {
    const { container } = wrap(<SpireIcon id="RELIC.C" size={24} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/art/relic/c@256.webp");
    expect(img.getAttribute("srcset")).toBe("/art/relic/c@64.webp 64w, /art/relic/c@128.webp 128w, /art/relic/c@256.webp 256w");
    expect(img.getAttribute("sizes")).toBe("24px");
    expect(img.getAttribute("width")).toBe("24");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("takes a sizes override for fluid layouts", () => {
    const { container } = wrap(<SpireIcon id="RELIC.C" size={56} sizes="(max-width: 480px) 90vw, 320px" />);
    expect(container.querySelector("img")!.getAttribute("sizes")).toBe("(max-width: 480px) 90vw, 320px");
  });

  it("omits srcset and sizes for items without widths", () => {
    const { container } = wrap(<SpireIcon id="RELIC.A" sizes="50vw" />);
    const img = container.querySelector("img")!;
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
  });

  it("falls back on error when it has a srcSet", () => {
    const { container } = wrap(<SpireIcon id="RELIC.C" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg title")!.textContent).toBe("Gamma");
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

  it("merges className onto the img and the fallback", () => {
    const { container } = wrap(<><SpireIcon id="RELIC.A" className="foo" /><SpireIcon id="CARD.X" className="bar" /></>);
    expect(container.querySelector("img")!.className).toContain("foo");
    expect(container.querySelector("span.bar")).not.toBeNull();
    const { container: c2 } = render(<FallbackIcon k="relic" title="t" className="baz" />);
    expect(c2.querySelector("svg")!.getAttribute("class")).toContain("baz");
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
