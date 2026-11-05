// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SpireAssets } from "../../registry/spire/lib/assets-provider";
import type { SpireManifest } from "../../registry/spire/lib/assets";
import { ClassBadge } from "../../registry/spire/game/class-badge";
import { StatEnergy, StatGold, StatHP } from "../../registry/spire/game/stat";
import { RelicStrip } from "../../registry/spire/game/relic-strip";
import { PotionSlots } from "../../registry/spire/game/potion-slots";

afterEach(cleanup);

const manifest: SpireManifest = {
  schemaVersion: 1, gameVersion: "t", generatedAt: "t",
  items: {
    "RELIC.A": { kind: "relic", file: "relics/a.png", w: 64, h: 64, name: "Alpha Relic", description: "Does alpha things." },
  },
};

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `RELIC.R_${i}` }));

const name = (c: HTMLElement) => c.querySelector("[data-slot=class-badge-name]")?.textContent ?? undefined;

describe("ClassBadge", () => {
  it("shows a known class name", () => {
    const { container } = render(<ClassBadge character="CHARACTER.IRONCLAD" />);
    expect(name(container)).toBe("Ironclad");
  });
  it("falls back to the unknown class glyph named Modded", () => {
    const { container } = render(<ClassBadge character="CHARACTER.MODDED" />);
    expect(name(container)).toBe("Modded");
    expect(container.querySelector("title")?.textContent).toBe("Modded");
  });
  it("can hide the name but stays labelled", () => {
    const { container } = render(<ClassBadge character="CHARACTER.SILENT" withName={false} />);
    expect(name(container)).toBeUndefined();
    expect(screen.getByLabelText("Silent")).toBeTruthy();
  });
});

describe("stats", () => {
  it("StatHP formats and handles null", () => {
    render(<StatHP current={72} max={92} />);
    expect(screen.getByText("72/92")).toBeTruthy();
    cleanup();
    render(<StatHP current={null} max={92} />);
    expect(screen.getByText("?/92")).toBeTruthy();
    cleanup();
    render(<StatHP current={null} max={null} />);
    expect(screen.getByText("?/?")).toBeTruthy();
  });
  it("StatGold and StatEnergy show values or ?", () => {
    render(<><StatGold value={133} /><StatEnergy value={null} /></>);
    expect(screen.getByText("133")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();
    expect(screen.getByLabelText("Gold: 133")).toBeTruthy();
    expect(screen.getByLabelText("Energy: unknown")).toBeTruthy();
  });
});

describe("RelicStrip", () => {
  it("renders accessible No relics when empty", () => {
    render(<RelicStrip relics={[]} />);
    expect(screen.getByText("No relics")).toBeTruthy();
  });
  it("40 relics with max=8 shows 8 icons and a +32 button listing hidden names", async () => {
    const user = userEvent.setup();
    const { container } = render(<RelicStrip relics={many(40)} max={8} />);
    expect(container.querySelectorAll('[data-slot="relic"]').length).toBe(8);
    const more = screen.getByRole("button", { name: /\+32/ });
    await user.click(more);
    const tip = (await screen.findAllByRole("tooltip"))[0]!;
    expect(tip.querySelectorAll("li").length).toBe(32);
    expect(tip.textContent).toContain("R 8");
    expect(tip.textContent).toContain("R 39");
    expect(tip.textContent).not.toContain("R 7,");
  });
  it("default max is 8", () => {
    const { container } = render(<RelicStrip relics={many(9)} />);
    expect(container.querySelectorAll('[data-slot="relic"]').length).toBe(8);
    expect(screen.getByRole("button", { name: /\+1/ })).toBeTruthy();
  });
  it("shows all with no overflow button when within max", () => {
    render(<RelicStrip relics={many(3)} />);
    expect(screen.queryByRole("button", { name: /more relics/ })).toBeNull();
  });
  it("tooltip shows manifest name and description on focus", async () => {
    const user = userEvent.setup();
    render(<SpireAssets base="/art" manifest={manifest}><RelicStrip relics={[{ id: "RELIC.A" }]} /></SpireAssets>);
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Alpha Relic");
    expect(tip.textContent).toContain("Does alpha things.");
  });
  it("unknown ids render a fallback with tidied name", async () => {
    const user = userEvent.setup();
    const { container } = render(<RelicStrip relics={[{ id: "RELIC.MODDED_THING_OF_DOOM" }]} />);
    expect(container.querySelector("svg title")?.textContent).toBe("Modded Thing of Doom");
    await user.tab();
    expect((await screen.findByRole("tooltip")).textContent).toContain("Modded Thing of Doom");
  });
});

describe("PotionSlots", () => {
  const slots = (c: HTMLElement) => Array.from(c.querySelectorAll("[data-slot='potion-slot']"));
  it("renders empty, empty, filled in order", () => {
    const { container } = render(<PotionSlots maxSlots={3} potions={[{ id: "POTION.FIRE", slot: 2 }]} />);
    const s = slots(container);
    expect(s.map((e) => e.getAttribute("data-filled"))).toEqual(["false", "false", "true"]);
    expect(screen.getAllByLabelText("Empty potion slot").length).toBe(2);
  });
  it("shows a potion with slot >= maxSlots, appended", () => {
    const { container } = render(
      <PotionSlots maxSlots={2} potions={[{ id: "POTION.A", slot: 0 }, { id: "POTION.EXTRA", slot: 5 }]} />,
    );
    const s = slots(container);
    expect(s.length).toBe(3);
    expect(s[2]!.getAttribute("data-filled")).toBe("true");
    expect(s[2]!.textContent + container.innerHTML).toContain("Extra");
  });
  it("keeps duplicate-slot potions rather than dropping", () => {
    const { container } = render(
      <PotionSlots maxSlots={2} potions={[{ id: "POTION.A", slot: 0 }, { id: "POTION.B", slot: 0 }]} />,
    );
    expect(slots(container).filter((e) => e.getAttribute("data-filled") === "true").length).toBe(2);
  });
  it("potion tooltip shows name on focus", async () => {
    const user = userEvent.setup();
    render(<PotionSlots maxSlots={1} potions={[{ id: "POTION.FIRE_POTION", slot: 0 }]} />);
    await user.tab();
    expect((await screen.findByRole("tooltip")).textContent).toContain("Fire Potion");
  });
});
