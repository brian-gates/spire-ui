// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerRow } from "../../registry/spire/game/player-row";
import { RunHeader } from "../../registry/spire/game/run-header";
import { RunRow, type RunPlayerView, type RunView } from "../../registry/spire/game/run-row";

afterEach(cleanup);

const you: RunPlayerView = {
  id: "p1", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 40, maxHp: 80, gold: 123, isYou: true,
  relics: [{ id: "RELIC.BURNING_BLOOD" }], potions: [{ id: "POTION.FIRE", slot: 0 }], maxPotionSlots: 3,
};
const friend: RunPlayerView = { id: "p2", name: "Bo", character: "CHARACTER.SILENT" };
const run: RunView = { id: "r1", act: 2, floor: 21, ascension: 2, mode: "regular", players: [you, friend] };

describe("RunRow", () => {
  it("shows act, floor and ascension", () => {
    render(<RunRow run={run} />);
    expect(screen.getByText("Act 2")).toBeTruthy();
    expect(screen.getByText("Floor 21")).toBeTruthy();
    expect(screen.getByText("A2")).toBeTruthy();
    expect(screen.getByText("Ascension 2")).toBeTruthy(); // screen reader text
  });
  it("has a Modded badge only for modded runs", () => {
    const { rerender } = render(<RunRow run={run} />);
    expect(screen.queryByText("Modded")).toBeNull();
    rerender(<RunRow run={{ ...run, mode: "modded" }} />);
    expect(screen.getByText("Modded")).toBeTruthy();
  });
  it("shows an Ended badge when ended", () => {
    render(<RunRow run={{ ...run, ended: true }} />);
    expect(screen.getByText("Ended")).toBeTruthy();
  });
  it("renders one player row per player and a you marker only for isYou", () => {
    const { container } = render(<RunRow run={run} />);
    expect(container.querySelectorAll("[data-slot=player-row]").length).toBe(2);
    expect(screen.getAllByText("you").length).toBe(1);
  });
  it("renders actions", () => {
    render(<RunRow run={run} actions={<button>Open</button>} />);
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
  });
});

describe("RunRow edge cases", () => {
  it("shows No relics for a player without relics", () => {
    render(<RunRow run={{ ...run, players: [{ ...friend, relics: [] }] }} />);
    expect(screen.getByText("No relics")).toBeTruthy();
  });
  it("keeps potions with gaps and beyond maxPotionSlots", () => {
    const p: RunPlayerView = {
      ...friend, maxPotionSlots: 2,
      potions: [{ id: "POTION.A", slot: 1 }, { id: "POTION.B", slot: 5 }, { id: "POTION.C", slot: 0 }],
    };
    const { container } = render(<RunRow run={{ ...run, players: [p] }} />);
    const slots = container.querySelectorAll("[data-slot=potion-slot]");
    expect(slots.length).toBe(3);
    expect(container.querySelectorAll("[data-slot=potion-slot][data-filled=true]").length).toBe(3);
  });
  it("renders a gap in the belt as an empty slot", () => {
    const p: RunPlayerView = { ...friend, maxPotionSlots: 3, potions: [{ id: "POTION.A", slot: 2 }] };
    const { container } = render(<RunRow run={{ ...run, players: [p] }} />);
    expect(container.querySelectorAll("[data-slot=potion-slot][data-filled=false]").length).toBe(2);
  });
});

describe("RunHeader", () => {
  it("shows relative saved time with absolute title, and who saved", () => {
    const savedAt = new Date(Date.now() - 3 * 3600_000);
    render(<RunHeader run={{ ...run, savedAt, savedBy: "Bo" }} />);
    const el = screen.getByText(/3 hours ago/);
    expect(el.textContent).toMatch(/by Bo/);
    expect(el.closest("[title]")?.getAttribute("title")).toBe(savedAt.toLocaleString());
  });
  it("omits saved text without savedAt", () => {
    render(<RunHeader run={run} />);
    expect(screen.queryByText(/Saved/)).toBeNull();
  });
});

describe("PlayerRow", () => {
  it("truncates a 32 character name visually but keeps it whole in title", () => {
    const name = "A".repeat(32);
    const { container } = render(<ul><PlayerRow player={{ ...friend, name }} /></ul>);
    const el = container.querySelector("[data-slot=player-name]") as HTMLElement;
    expect(el.getAttribute("title")).toBe(name);
    expect(el.className).toMatch(/truncate/);
    expect(el.textContent).toBe(name);
  });
  it("shows unknown stats as ?", () => {
    render(<ul><PlayerRow player={friend} /></ul>);
    expect(screen.getByRole("img", { name: "HP: unknown" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Gold: unknown" })).toBeTruthy();
  });
  it("renders relics and potions for a full player", () => {
    const { container } = render(<ul><PlayerRow player={you} /></ul>);
    const row = container.querySelector("[data-slot=player-row]") as HTMLElement;
    expect(within(row).getByRole("list", { name: "Relics" })).toBeTruthy();
    expect(within(row).getByRole("list", { name: "Potions" })).toBeTruthy();
    expect(within(row).getByRole("img", { name: "HP: 40/80" })).toBeTruthy();
  });
  it("places the loot block after name and stats in document order", () => {
    const { container } = render(<ul><PlayerRow player={you} /></ul>);
    const row = container.querySelector("[data-slot=player-row]") as HTMLElement;
    const loot = row.querySelector("[data-slot=player-loot]") as HTMLElement;
    const kids = Array.from(row.children);
    const hp = screen.getByRole("img", { name: "HP: 40/80" });
    const gold = screen.getByRole("img", { name: "Gold: 123" });
    expect(kids[kids.length - 1]).toBe(loot);
    for (const stat of [hp, gold]) {
      expect(row.contains(stat) && !loot.contains(stat)).toBe(true);
      expect(stat.compareDocumentPosition(loot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(loot.querySelector("[aria-label=Relics]")).toBeTruthy();
    expect(loot.querySelector("[aria-label=Potions]")).toBeTruthy();
  });
});

describe("deck size and class label", () => {
  it("shows the deck size with an accessible label", () => {
    render(<ul><PlayerRow player={{ ...friend, deckSize: 27 }} /></ul>);
    expect(screen.getByRole("img", { name: "Deck: 27" })).toBeTruthy();
    expect(screen.getByText("27")).toBeTruthy();
  });
  it("shows a null deck size as unknown and omits the stat when not provided", () => {
    const { rerender } = render(<ul><PlayerRow player={{ ...friend, deckSize: null }} /></ul>);
    expect(screen.getByRole("img", { name: "Deck: unknown" })).toBeTruthy();
    rerender(<ul><PlayerRow player={friend} /></ul>);
    expect(screen.queryByRole("img", { name: /^Deck/ })).toBeNull();
  });
  it("renders the class label as a muted truncating subtitle", () => {
    const { container } = render(<ul><PlayerRow player={{ ...friend, characterLabel: "The Silent" }} /></ul>);
    const el = container.querySelector("[data-slot=player-class]") as HTMLElement;
    expect(el.textContent).toBe("The Silent");
    expect(el.className).toMatch(/truncate/);
    expect(el.className).toMatch(/text-spire-muted/);
    expect(el.getAttribute("title")).toBe("The Silent");
  });
  it("has no subtitle without a class label", () => {
    const { container } = render(<ul><PlayerRow player={friend} /></ul>);
    expect(container.querySelector("[data-slot=player-class]")).toBeNull();
  });
});

describe("unknown relics and run position", () => {
  it("says Relics unknown for undefined relics and No relics for an empty list", () => {
    const { rerender } = render(<ul><PlayerRow player={friend} /></ul>);
    expect(screen.getByText("Relics unknown")).toBeTruthy();
    expect(screen.queryByText("No relics")).toBeNull();
    rerender(<ul><PlayerRow player={{ ...friend, relics: [] }} /></ul>);
    expect(screen.getByText("No relics")).toBeTruthy();
    expect(screen.queryByText("Relics unknown")).toBeNull();
  });
  it("renders null act, floor and ascension as ? with accessible text", () => {
    render(<RunHeader run={{ ...run, act: null, floor: null, ascension: null, mode: "modded" }} />);
    expect(screen.getByText("Act ?")).toBeTruthy();
    expect(screen.getByText("Floor ?")).toBeTruthy();
    expect(screen.getByText("A?")).toBeTruthy();
    expect(screen.getByText("Act unknown")).toBeTruthy();
    expect(screen.getByText("Floor unknown")).toBeTruthy();
    expect(screen.getByText("Ascension unknown")).toBeTruthy();
    expect(screen.getByText("Modded")).toBeTruthy();
  });
  it("keeps the other values when only the ascension is unknown", () => {
    render(<RunRow run={{ ...run, ascension: null }} />);
    expect(screen.getByText("Act 2")).toBeTruthy();
    expect(screen.getByText("Floor 21")).toBeTruthy();
    expect(screen.getByText("Ascension unknown")).toBeTruthy();
  });
});
