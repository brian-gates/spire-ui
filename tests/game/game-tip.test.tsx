// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GameTip, ItemTip } from "../../registry/spire/game/game-tip";
import { PotionSlots } from "../../registry/spire/game/potion-slots";
import { RelicStrip } from "../../registry/spire/game/relic-strip";
import { parseManifest, type SpireManifest } from "../../registry/spire/lib/assets";
import { SpireAssets } from "../../registry/spire/lib/assets-provider";

afterEach(cleanup);

// Invented items and text; no game text.
const manifest: SpireManifest = {
  schemaVersion: 1,
  gameVersion: "t",
  generatedAt: "t",
  items: {
    "RELIC.PEBBLE": {
      kind: "relic",
      file: "relic/pebble@64.webp",
      w: 64,
      h: 64,
      name: "Test Pebble",
      description: "Gain X Block.",
      relic: { rarity: "Uncommon", pool: "shared", description: "Gain 4 Block.", descriptionRuns: [{ text: "Gain " }, { text: "4", style: "blue" }, { text: " " }, { text: "Block", style: "gold" }, { text: "." }] },
    },
    "RELIC.PLAIN": { kind: "relic", file: "relic/plain@64.webp", w: 64, h: 64, name: "Plain Thing", description: "Does X things." },
    "POTION.TONIC": { kind: "potion", file: "potion/tonic@64.webp", w: 64, h: 64, name: "Test Tonic", potion: { rarity: "Rare", description: "Heal 5." } },
    "UI.HOVER_TIP": { kind: "ui", file: "ui/hover_tip@320.webp", w: 320, h: 96, widths: [80, 160, 320], slice: { left: 55, top: 43, right: 72, bottom: 21 } },
  },
};

const withArt = (children: React.ReactNode, m: SpireManifest = manifest) => (
  <SpireAssets base="/art" manifest={m}>
    {children}
  </SpireAssets>
);

describe("GameTip", () => {
  it("draws the extracted panel as a nine-slice border image, with real text", () => {
    const { container } = render(withArt(<ItemTip id="RELIC.PEBBLE" />));
    const tip = container.querySelector("[data-slot=game-tip]")!;
    expect(tip.getAttribute("data-variant")).toBe("game");
    const panel = container.querySelector<HTMLElement>("[data-slot=game-tip-panel]")!;
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    // happy-dom drops border-image, so the slice it is drawn with is checked on the element.
    expect(panel.getAttribute("data-slice")).toBe("43 72 21 55");
    expect(panel.getAttribute("style")).toContain("border-width: 30.1px 50.4px 14.7px 38.5px");
    expect(screen.getByText("Test Pebble")).toBeTruthy();
    expect(container.querySelector("[data-slot=game-tip-rarity]")!.textContent).toBe("Uncommon Relic");
    expect(container.querySelector("[data-slot=game-tip-text]")!.textContent).toBe("Gain 4 Block.");
    expect(container.querySelector("[data-style=blue]")!.textContent).toBe("4");
  });

  it("without the panel it uses the kit's panel; without stats, the plain description and no rarity", () => {
    const { container } = render(<ItemTip id="RELIC.PLAIN" />);
    expect(container.querySelector("[data-slot=game-tip]")!.getAttribute("data-variant")).toBe("fallback");
    cleanup();
    const r = render(withArt(<ItemTip id="RELIC.PLAIN" />));
    expect(r.container.querySelector("[data-slot=game-tip-text]")!.textContent).toBe("Does X things.");
    expect(r.container.querySelector("[data-slot=game-tip-rarity]")).toBeNull();
  });

  it("unknown ids show their tidied name only", () => {
    const { container } = render(withArt(<ItemTip id="RELIC.MODDED_ORB_OF_DOOM" />));
    expect(container.textContent).toBe("Modded Orb of Doom");
  });

  it("scales from the game's pixels and accepts a title, runs and an icon", () => {
    const { container } = render(withArt(<GameTip title="Custom" runs={[{ text: "Hi" }]} icon={<span data-testid="icon" />} scale={1} />));
    const tip = container.querySelector<HTMLElement>("[data-slot=game-tip]")!;
    expect(tip.style.width).toBe("348px");
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("a malformed slice in the manifest is dropped and the game's own borders are used", () => {
    const bad = parseManifest({ ...manifest, items: { ...manifest.items, "UI.HOVER_TIP": { ...manifest.items["UI.HOVER_TIP"], slice: { left: 300, top: 1, right: 30, bottom: 1 } } } })!;
    expect(bad.items["UI.HOVER_TIP"]!.slice).toBeUndefined();
    const { container } = render(withArt(<ItemTip id="RELIC.PEBBLE" />, bad));
    expect(container.querySelector<HTMLElement>("[data-slot=game-tip-panel]")!.getAttribute("data-slice")).toBe("43 72 21 55");
  });
});

describe("relic and potion tooltips use GameTip", () => {
  it("RelicStrip: keyboard focus opens the game tip with rarity and text", async () => {
    const user = userEvent.setup();
    render(withArt(<RelicStrip relics={[{ id: "RELIC.PEBBLE" }]} />));
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Test Pebble");
    expect(tip.textContent).toContain("Uncommon Relic");
    expect(tip.textContent).toContain("Gain 4 Block.");
    expect(document.querySelector("[data-slot=tooltip-content]")!.getAttribute("data-bare")).toBe("true");
  });

  it("PotionSlots: keyboard focus opens the game tip", async () => {
    const user = userEvent.setup();
    render(withArt(<PotionSlots maxSlots={1} potions={[{ id: "POTION.TONIC", slot: 0 }]} />));
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Rare Potion");
    expect(tip.textContent).toContain("Heal 5.");
  });
});

describe("parseManifest relic and potion stats", () => {
  it("keeps well-typed fields and drops the rest", () => {
    const m = parseManifest({
      schemaVersion: 1,
      gameVersion: "t",
      generatedAt: "t",
      items: {
        "RELIC.A": { kind: "relic", file: "a.webp", w: 1, h: 1, relic: { rarity: 3, pool: "shared", descriptionRuns: [{ text: "x", style: "glow" }], unknown: ["vars"] } },
        "RELIC.B": { kind: "relic", file: "b.webp", w: 1, h: 1, relic: "nope", potion: { rarity: "Common" } },
      },
    })!;
    expect(m.items["RELIC.A"]!.relic).toEqual({ pool: "shared", descriptionRuns: [{ text: "x" }], unknown: ["vars"] });
    expect(m.items["RELIC.B"]!.relic).toBeUndefined();
    expect(m.items["RELIC.B"]!.potion).toEqual({ rarity: "Common" });
  });
});
