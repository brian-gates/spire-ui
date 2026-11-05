// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GAME_CARD_LAYOUT, GameCard, gameCardPieces } from "../../registry/spire/game/game-card";
import type { ManifestItem, SpireManifest } from "../../registry/spire/lib/assets";
import { SpireAssets } from "../../registry/spire/lib/assets-provider";

afterEach(cleanup);

const piece = (slug: string, w: number, h: number): ManifestItem => ({ kind: "ui", file: `ui/${slug}@${w}.webp`, w, h, widths: [Math.round(w / 4), Math.round(w / 2), w] });

const card: ManifestItem = {
  kind: "card",
  file: "card/bonk@512.webp",
  w: 512,
  h: 389,
  widths: [256, 512],
  name: "Bonk",
  card: {
    cost: 2,
    upgradedCost: 1,
    type: "Attack",
    rarity: "Rare",
    frame: "card_frame_green",
    keywords: ["Exhaust"],
    vars: { Damage: { base: 5, upgraded: 7 } },
    description: "Deal 5 damage. Apply 1 Weak.",
    upgradedDescription: "Deal 7 damage. Apply 1 Weak.",
    descriptionRuns: [{ text: "Deal " }, { text: "5", style: "number" }, { text: " damage.\nApply " }, { text: "1", style: "number" }, { text: " " }, { text: "Weak", style: "gold" }, { text: "." }],
    upgradedDescriptionRuns: [{ text: "Deal " }, { text: "7", style: "upgraded" }, { text: " damage.\nApply " }, { text: "1", style: "number" }, { text: " " }, { text: "Weak", style: "gold" }, { text: "." }],
  },
};

const pieces: Record<string, ManifestItem> = {
  "UI.CARD_FRAME.ATTACK.GREEN": piece("card_frame-attack-green", 598, 844),
  "UI.CARD_BANNER.RARE": piece("card_banner-rare", 655, 170),
  "UI.CARD_PORTRAIT_BORDER.ATTACK.RARE": piece("card_portrait_border-attack-rare", 551, 420),
  "UI.CARD_PLAQUE.RARE": piece("card_plaque-rare", 123, 75),
  "UI.CARD_ORB.SILENT": piece("card_orb-silent", 74, 74),
};

const manifest = (withPieces: boolean): SpireManifest => ({
  schemaVersion: 1,
  gameVersion: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  items: { "CARD.BONK": card, ...(withPieces ? pieces : {}) },
  ...(withPieces ? { cardLayout: GAME_CARD_LAYOUT } : {}),
});

const draw = (withPieces: boolean, upgrades = 0) =>
  render(
    <SpireAssets base="/art" manifest={manifest(withPieces)}>
      <GameCard id="CARD.BONK" upgrades={upgrades} width={240} />
    </SpireAssets>,
  );

describe("gameCardPieces", () => {
  it("picks frame colour by the card's frame, shape by type and banner by rarity", () => {
    expect(gameCardPieces({ type: "Power", rarity: "Uncommon", frame: "card_frame_pink" })).toEqual({
      frame: "UI.CARD_FRAME.POWER.PINK",
      banner: "UI.CARD_BANNER.UNCOMMON",
      portraitBorder: "UI.CARD_PORTRAIT_BORDER.POWER.UNCOMMON",
      plaque: "UI.CARD_PLAQUE.UNCOMMON",
      orb: "UI.CARD_ORB.NECROBINDER",
      star: "UI.CARD_STAR",
    });
    // Curses and statuses wear the skill shape; Basic wears the common banner.
    expect(gameCardPieces({ type: "Curse", rarity: "Curse", frame: "card_frame_curse" }).frame).toBe("UI.CARD_FRAME.SKILL.CURSE");
    expect(gameCardPieces({ type: "Skill", rarity: "Basic", frame: "card_frame_red" }).banner).toBe("UI.CARD_BANNER.COMMON");
    expect(gameCardPieces({ type: "Quest", rarity: "Quest", frame: "card_frame_quest" }).frame).toBe("UI.CARD_FRAME.QUEST.QUEST");
    // No frame: the pool, else the player's character, else colorless.
    expect(gameCardPieces({ type: "Attack", rarity: "Common", pool: "defect" }).frame).toBe("UI.CARD_FRAME.ATTACK.BLUE");
    expect(gameCardPieces({ type: "Attack", rarity: "Common" }, "CHARACTER.REGENT").orb).toBe("UI.CARD_ORB.REGENT");
    expect(gameCardPieces({ type: "Attack", rarity: "Common" }).frame).toBe("UI.CARD_FRAME.ATTACK.COLORLESS");
  });
});

describe("GameCard", () => {
  it("composes the extracted pieces with srcsets sized to their share of the card", () => {
    const { container } = draw(true);
    const root = container.querySelector("[data-slot=game-card]") as HTMLElement;
    expect(root.dataset.variant).toBe("game");
    const frame = container.querySelector("[data-slot=game-card-frame]") as HTMLImageElement;
    expect(frame.getAttribute("src")).toBe("/art/ui/card_frame-attack-green@598.webp");
    expect(frame.getAttribute("srcset")).toContain("/art/ui/card_frame-attack-green@150.webp 150w");
    // 300 of the 330px-wide card box, drawn 240 wide.
    expect(frame.getAttribute("sizes")).toBe("218px");
    expect(container.querySelector("[data-slot=game-card-banner]")?.getAttribute("src")).toBe("/art/ui/card_banner-rare@655.webp");
    expect(container.querySelector("[data-slot=game-card-orb]")?.getAttribute("src")).toBe("/art/ui/card_orb-silent@74.webp");
    // Decorative images are hidden from assistive tech; the card is one named group.
    for (const img of container.querySelectorAll("img")) expect(img.getAttribute("alt")).toBe("");
    expect(screen.getByRole("group", { name: "Bonk, Attack, Rare, cost 2" })).toBe(root);
  });

  it("shows the name, cost, type and text as real text, numbers and keywords marked", () => {
    const { container } = draw(true);
    expect(container.querySelector("[data-slot=game-card-name]")?.textContent).toBe("Bonk");
    expect(container.querySelector("[data-slot=game-card-cost]")?.textContent).toBe("2");
    expect(container.querySelector("[data-slot=game-card-type]")?.textContent).toBe("Attack");
    const text = container.querySelector("[data-slot=game-card-text]")!;
    expect(text.textContent).toBe("Deal 5 damage.\nApply 1 Weak.\nExhaust.");
    expect(text.querySelector("[data-style=number]")?.textContent).toBe("5");
    expect(text.querySelector("[data-style=gold]")?.textContent).toBe("Weak");
    expect(text.querySelector("[data-style=upgraded]")).toBeNull();
  });

  it("an upgraded copy shows +, its upgraded cost and text, changed numbers marked upgraded", () => {
    const { container } = draw(true, 1);
    expect(container.querySelector("[data-slot=game-card-name]")?.textContent).toBe("Bonk+");
    expect(container.querySelector("[data-slot=game-card-cost]")?.textContent).toBe("1");
    expect(container.querySelector("[data-style=upgraded]")?.textContent).toBe("7");
    expect(screen.getByRole("group", { name: "Bonk+, Attack, Rare, cost 1" })).toBeTruthy();
  });

  it("an unplayable card has no orb", () => {
    const m = manifest(true);
    m.items["CARD.BONK"] = { ...card, card: { ...card.card!, cost: null } };
    const { container } = render(
      <SpireAssets base="/art" manifest={m}>
        <GameCard id="CARD.BONK" />
      </SpireAssets>,
    );
    expect(container.querySelector("[data-slot=game-card-cost]")).toBeNull();
    expect(screen.getByRole("group", { name: "Bonk, Attack, Rare, Unplayable" })).toBeTruthy();
  });

  it("falls back to CardFrame, with the card's text, when the manifest has no pieces", () => {
    const { container } = draw(false, 1);
    expect((container.querySelector("[data-slot=game-card]") as HTMLElement).dataset.variant).toBe("fallback");
    expect(container.querySelector("[data-slot=card-frame]")).toBeTruthy();
    expect(container.querySelector("[data-slot=card-name]")?.textContent).toBe("Bonk+");
    expect(container.querySelector("[data-slot=game-card-text]")?.textContent).toContain("7");
  });

  it("falls back for an id with no stats at all", () => {
    const { container } = render(<GameCard id="CARD.NOTHING" />);
    expect(container.querySelector("[data-slot=card-frame]")).toBeTruthy();
    expect(container.querySelector("[data-slot=game-card-text]")).toBeNull();
  });
});
