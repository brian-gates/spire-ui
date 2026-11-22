// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clampFraction, formatAmount } from "../../registry/spire/lib/combat-tones";
import { StatTile, StatTiles } from "../../registry/spire/game/stat-tile";
import { SourceBar } from "../../registry/spire/game/source-bar";
import { RoundCard } from "../../registry/spire/game/round-card";
import { LogRow } from "../../registry/spire/game/log-row";
import { CombatLog } from "../../registry/spire/game/combat-log";

afterEach(cleanup);

const fill = (el: Element) => (el.firstElementChild as HTMLElement | null)?.style.width;

describe("combat tones", () => {
  it("clamps fractions to 0..1 and treats non-numbers as 0", () => {
    expect([clampFraction(-1), clampFraction(0.25), clampFraction(3), clampFraction(Number.NaN), clampFraction(Infinity)]).toEqual([0, 0.25, 1, 0, 0]);
  });
  it("formats with thousands separators", () => {
    expect(formatAmount(1204)).toBe("1,204");
  });
});

describe("StatTile", () => {
  it("is a labelled dt/dd pair inside a named dl", () => {
    render(
      <StatTiles label="Totals">
        <StatTile label="Dealt" value={1204} tone="dealt" />
        <StatTile label="Healed" value={0} tone="healed" />
      </StatTiles>,
    );
    const list = screen.getAllByRole("term")[0]!.closest("dl")!;
    expect(list.getAttribute("aria-label")).toBe("Totals");
    expect([...list.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["Dealt", "Healed"]);
    expect([...list.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["1,204", "0"]);
    expect(list.querySelector("dd")!.className).toContain("text-spire-dealt");
  });
  it("shows ? for an unknown value and says unknown to screen readers", () => {
    const { container } = render(<StatTiles label="T"><StatTile label="Block" value={null} /></StatTiles>);
    const dd = container.querySelector("dd")!;
    expect(dd.querySelector("[aria-hidden]")!.textContent).toBe("?");
    expect(dd.querySelector(".sr-only")!.textContent).toBe("unknown");
  });
});

describe("SourceBar", () => {
  it("shows name and amount with a labelled bar at the given share", () => {
    render(<ul><SourceBar name="Strike" amount={6} fraction={0.75} icon={<svg data-testid="ico" />} /></ul>);
    expect(screen.getByText("Strike")).toBeTruthy();
    expect(screen.getByText("6").className).toContain("text-spire-dealt");
    const bar = screen.getByRole("img", { name: "75% of the largest" });
    expect(fill(bar)).toBe("75%");
    expect(screen.getByTestId("ico").parentElement!.getAttribute("aria-hidden")).toBe("true");
  });
  it("takes the taken tone, a custom bar label, and draws nothing for a zero share", () => {
    render(<ul><SourceBar name="Cultist" amount={0} fraction={0} tone="taken" barLabel="Cultist dealt nothing" /></ul>);
    expect(screen.getByText("0").className).toContain("text-spire-taken");
    expect(screen.getByRole("img", { name: "Cultist dealt nothing" }).children.length).toBe(0);
  });
  it("clamps an out-of-range share", () => {
    render(<ul><SourceBar name="X" amount={9} fraction={4} /></ul>);
    expect(fill(screen.getByRole("img"))).toBe("100%");
  });
});

describe("RoundCard", () => {
  it("is a section named by its heading, with totals and a split bar", () => {
    render(<RoundCard round={2} dealt={3} taken={15}><LogRow amount="3">Lightning</LogRow></RoundCard>);
    const card = screen.getByRole("heading", { level: 3, name: "Round 2" }).closest("section")!;
    // Not a named region: a long fight shouldn't add a landmark per round.
    expect(screen.queryByRole("region")).toBeNull();
    expect(card.textContent).toContain("3 dealt");
    expect(card.textContent).toContain("15 taken");
    const split = within(card).getByRole("img", { name: "Dealt 17%, taken 83%" });
    expect([...split.children].map((c) => (c as HTMLElement).style.width)).toEqual(["16.666666666666664%", "83.33333333333334%"]);
    expect(within(card).getAllByRole("listitem")).toHaveLength(1);
  });
  it("handles a round with no damage and a custom heading level and title", () => {
    render(<RoundCard round={1} dealt={0} taken={0} headingLevel={4} title="Opening" />);
    expect(screen.getByRole("heading", { level: 4, name: "Opening" })).toBeTruthy();
    const split = screen.getByRole("img", { name: "No damage" });
    expect(split.children.length).toBe(0);
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("LogRow", () => {
  it("lays out icon | text | amount | bar with the bar in its own cell", () => {
    render(<ol><LogRow amount="11 saved" tone="saved" fraction={1} icon={<svg data-testid="i" />}>Twig Slime (M)</LogRow></ol>);
    const row = screen.getByRole("listitem");
    const cells = [...row.children] as HTMLElement[];
    expect(cells).toHaveLength(4);
    expect(cells[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(cells[1]!.textContent).toBe("Twig Slime (M)");
    expect(cells[2]!.textContent).toBe("11 saved");
    expect(cells[2]!.className).toContain("text-spire-saved");
    expect(cells[3]!.getAttribute("role")).toBe("img");
    expect(cells[3]!.getAttribute("aria-label")).toBe("100% of the largest");
    expect((cells[3]!.firstElementChild as HTMLElement).className).toContain("bg-spire-saved");
  });
  it("keeps dealt amounts cream with a dealt-coloured bar", () => {
    render(<ol><LogRow amount="6" tone="dealt" fraction={0.5}>Strike</LogRow></ol>);
    const cells = [...screen.getByRole("listitem").children] as HTMLElement[];
    expect(cells[2]!.className).toContain("text-spire-ink");
    expect((cells[3]!.firstElementChild as HTMLElement).className).toContain("bg-spire-dealt");
    expect(fill(cells[3]!)).toBe("50%");
  });
  it("leaves the bar cell empty without an amount, and draws an accent stripe", () => {
    const { container } = render(<ol><LogRow accent="#ec6a5e">Fire Potion used</LogRow></ol>);
    const cells = [...screen.getByRole("listitem").children] as HTMLElement[];
    expect(cells[3]!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    expect((container.querySelector("[data-slot=log-row-accent]") as HTMLElement).style.background).toBe("#ec6a5e");
  });
});

describe("CombatLog", () => {
  it("renders a heading and one card per round with its rows", () => {
    render(
      <CombatLog
        rounds={[
          { round: 1, dealt: 9, taken: 4, rows: [{ key: 1, text: "Strike → Leaf Slime (M)", amount: "6", tone: "dealt", fraction: 6 / 11 }, { key: 2, text: "Twig Slime (S)", amount: "4", tone: "taken", fraction: 4 / 11 }] },
          { round: 2, dealt: 0, taken: 0, rows: [{ key: 3, text: "", amount: "+6", tone: "healed", fraction: 6 / 11 }] },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Combat log" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Round 1", "Round 2"]);
    const r1 = screen.getByRole("heading", { level: 3, name: "Round 1" }).closest("section")!;
    expect(within(r1).getAllByRole("listitem").map((li) => li.children[1]!.textContent)).toEqual(["Strike → Leaf Slime (M)", "Twig Slime (S)"]);
  });
  it("says so when there are no rounds", () => {
    render(<CombatLog rounds={[]} headingLevel={3} title="Log" />);
    expect(screen.getByRole("heading", { level: 3, name: "Log" })).toBeTruthy();
    expect(screen.getByText("No hits recorded.")).toBeTruthy();
  });
});
