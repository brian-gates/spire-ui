// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardFrame } from "../../registry/spire/game/card-frame";
import { MapNode } from "../../registry/spire/game/map-node";

afterEach(cleanup);

const frame = (c: HTMLElement) => c.querySelector("[data-slot=card-frame]") as HTMLElement;
const base = { name: "Strike", type: "attack", rarity: "common" } as const;

describe("CardFrame", () => {
  it("shows an X cost", () => {
    const { container } = render(<CardFrame {...base} cost="X" />);
    expect(container.querySelector("[data-slot=card-cost]")?.textContent).toBe("X");
    expect(screen.getByLabelText("Cost X")).toBeTruthy();
  });
  it("shows a numeric cost including 0", () => {
    const { container } = render(<CardFrame {...base} cost={0} />);
    expect(container.querySelector("[data-slot=card-cost]")?.textContent).toBe("0");
  });
  it("has no cost badge for null", () => {
    const { container } = render(<CardFrame {...base} cost={null} />);
    expect(container.querySelector("[data-slot=card-cost]")).toBeNull();
  });
  it("appends + to the name when upgraded", () => {
    const { container } = render(<CardFrame {...base} cost={1} upgraded />);
    expect(container.querySelector("[data-slot=card-name]")?.textContent).toBe("Strike+");
  });
  it("leaves the name alone when not upgraded", () => {
    const { container } = render(<CardFrame {...base} cost={1} />);
    expect(container.querySelector("[data-slot=card-name]")?.textContent).toBe("Strike");
  });
  it("colours the frame by character, with colorless for unknown or missing", () => {
    for (const [character, want] of [
      ["ironclad", "ironclad"], ["CHARACTER.SILENT", "silent"], ["defect", "defect"],
      ["regent", "regent"], ["necrobinder", "necrobinder"],
      ["modded", "colorless"], [undefined, "colorless"],
    ] as const) {
      const { container, unmount } = render(<CardFrame {...base} cost={1} character={character} />);
      expect(frame(container).className, String(character)).toContain(`border-class-${want}`);
      unmount();
    }
  });
  it("shows rarity on the banner and exposes the type", () => {
    const { container } = render(<CardFrame {...base} cost={1} rarity="rare" type="power" />);
    expect(container.querySelector("[data-slot=card-banner]")?.className).toContain("border-rarity-rare");
    expect(frame(container).getAttribute("aria-label")).toBe("Strike, Power, Rare, cost 1");
  });
  it("renders children in the art slot, or a generic card fallback for an id", () => {
    const { container, unmount } = render(<CardFrame {...base} cost={1}><b data-testid="art" /></CardFrame>);
    expect(screen.getByTestId("art")).toBeTruthy();
    unmount();
    const r = render(<CardFrame {...base} cost={1} id="CARD.STRIKE" />);
    expect(r.container.querySelector("[data-slot=card-art] svg")).toBeTruthy();
  });
});

describe("MapNode", () => {
  it("names the room and state", () => {
    render(<MapNode room="elite" state="visited" />);
    expect(screen.getByRole("img", { name: "Elite (visited)" })).toBeTruthy();
  });
  it("defaults to available", () => {
    render(<MapNode room="rest" />);
    expect(screen.getByRole("img", { name: "Rest (available)" })).toBeTruthy();
  });
  it("styles states distinctly", () => {
    const cls = (s: "available" | "visited" | "locked") => {
      const { container, unmount } = render(<MapNode room="shop" state={s} />);
      const c = (container.firstElementChild as HTMLElement).className;
      unmount();
      return c;
    };
    expect(new Set([cls("available"), cls("visited"), cls("locked")]).size).toBe(3);
  });
});
