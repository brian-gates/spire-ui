// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpireAssets } from "../../registry/spire/lib/assets-provider";
import { HpBar } from "../../registry/spire/game/hp-bar";
import { StatHP } from "../../registry/spire/game/stat";

afterEach(cleanup);

const fillWidth = (c: HTMLElement) => (c.querySelector('[data-slot="hp-bar-fill"]') as HTMLElement).style.width;

describe("HpBar", () => {
  it("sizes the fill to current/max", () => {
    const { container } = render(<HpBar current={31} max={62} />);
    expect(fillWidth(container)).toBe("50%");
    expect(screen.getByText("31/62")).toBeTruthy();
  });
  it("clamps the fill but keeps the real numbers", () => {
    const over = render(<HpBar current={95} max={80} />);
    expect(fillWidth(over.container)).toBe("100%");
    expect(screen.getByText("95/80")).toBeTruthy();
    cleanup();
    expect(fillWidth(render(<HpBar current={-5} max={80} />).container)).toBe("0%");
    cleanup();
    expect(fillWidth(render(<HpBar current={5} max={0} />).container)).toBe("0%");
  });
  it("shows ? for unknown values, with no fill", () => {
    const both = render(<HpBar current={null} max={null} />);
    expect(screen.getByText("?/?")).toBeTruthy();
    expect(screen.getByText("unknown").className).toContain("sr-only");
    expect(fillWidth(both.container)).toBe("0%");
    cleanup();
    const cur = render(<HpBar current={62} max={null} />);
    expect(screen.getByText("62/?")).toBeTruthy();
    expect(fillWidth(cur.container)).toBe("0%");
    cleanup();
    const mx = render(<HpBar current={null} max={80} />);
    expect(screen.getByText("?/80")).toBeTruthy();
    expect(fillWidth(mx.container)).toBe("0%");
  });
  it("is a meter only when both values are known", () => {
    render(<HpBar current={31} max={62} />);
    const meter = screen.getByRole("meter", { name: "HP" });
    expect(meter.getAttribute("aria-valuenow")).toBe("31");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("62");
    cleanup();
    render(<HpBar current={31} max={null} />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByLabelText("HP").hasAttribute("aria-valuenow")).toBe(false);
  });
  it("shows the block badge only when block > 0", () => {
    const withBlock = render(<HpBar current={31} max={62} block={7} />);
    expect(withBlock.container.querySelector('[data-slot="hp-bar-block"]')?.textContent).toBe("7");
    for (const block of [0, null, undefined]) {
      cleanup();
      const r = render(<HpBar current={31} max={62} block={block} />);
      expect(r.container.querySelector('[data-slot="hp-bar-block"]')).toBeNull();
    }
  });
});

describe("HpBar label outline", () => {
  const stroke = (c: HTMLElement) => (c.querySelector('[data-slot="hp-bar-label"]') as HTMLElement).style.getPropertyValue("--hp-outline");
  it("is dark red normally and dark blue with block", () => {
    const plain = render(<HpBar current={31} max={62} />);
    expect(plain.container.querySelector('[data-blocked]')).toBeNull();
    expect(stroke(plain.container)).toBe("#900000");
    cleanup();
    const blocked = render(<HpBar current={31} max={62} block={4} />);
    expect(blocked.container.querySelector('[data-blocked="true"]')).not.toBeNull();
    expect(stroke(blocked.container)).toBe("#0B2A4A");
  });
});

describe("HpBar fill colour", () => {
  const bg = (c: HTMLElement) => (c.querySelector('[data-slot="hp-bar-fill"]') as HTMLElement).style.background;
  it("is red normally and steel blue with block", () => {
    const plain = render(<HpBar current={31} max={62} />);
    expect(bg(plain.container)).toContain("#EE343F");
    cleanup();
    const blocked = render(<HpBar current={31} max={62} block={4} />);
    expect(bg(blocked.container)).toContain("#3B6DA0");
    expect(bg(blocked.container)).not.toContain("#EE343F");
  });
});

describe("HpBar block shield", () => {
  it("draws the extracted shield with the number when the manifest has UI.BLOCK, else the badge", () => {
    const manifest = { schemaVersion: 1 as const, gameVersion: "t", generatedAt: "2026-01-01T00:00:00.000Z", items: { "UI.BLOCK": { kind: "ui" as const, file: "ui/block@64.webp", w: 64, h: 64 } } };
    const { container } = render(
      <SpireAssets base="/art" manifest={manifest as never}>
        <HpBar current={31} max={62} block={9} />
      </SpireAssets>,
    );
    const block = container.querySelector('[data-slot="hp-bar-block"]')!;
    expect(block.querySelector("img")?.getAttribute("src")).toBe("/art/ui/block@64.webp");
    expect(block.textContent).toBe("9");
  });
});

describe("StatHP", () => {
  it("renders an HpBar", () => {
    render(<StatHP current={72} max={92} />);
    expect(screen.getByRole("img", { name: "HP: 72/92" })).toBeTruthy();
  });
});
