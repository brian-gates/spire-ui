// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Panel } from "../../registry/spire/ui/panel";
import { Banner } from "../../registry/spire/ui/banner";
import { Button } from "../../registry/spire/ui/button";
import { Badge } from "../../registry/spire/ui/badge";
import { Divider } from "../../registry/spire/ui/divider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../registry/spire/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../registry/spire/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../../registry/spire/ui/dialog";

afterEach(cleanup);

describe("className merging", () => {
  it("Panel, Banner, Badge, Divider, Button merge className", () => {
    render(
      <div>
        <Panel data-testid="p" className="extra-p" />
        <Banner data-testid="b" className="extra-b" />
        <Badge data-testid="g" className="extra-g" />
        <Divider data-testid="d" className="extra-d" />
        <Button data-testid="btn" className="extra-btn" />
      </div>,
    );
    for (const [id, c] of [["p", "extra-p"], ["b", "extra-b"], ["g", "extra-g"], ["d", "extra-d"], ["btn", "extra-btn"]]) {
      expect(screen.getByTestId(id).className).toContain(c);
    }
  });

  it("Tabs parts merge className", () => {
    render(
      <Tabs defaultValue="a" className="x-tabs">
        <TabsList className="x-list" data-testid="list">
          <TabsTrigger value="a" className="x-trigger">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="x-content">body</TabsContent>
      </Tabs>,
    );
    expect(screen.getByTestId("list").className).toContain("x-list");
    expect(screen.getByRole("tab").className).toContain("x-trigger");
    expect(screen.getByRole("tabpanel").className).toContain("x-content");
  });
});

describe("variants", () => {
  it("Panel variant and Banner tone change classes", () => {
    render(
      <div>
        <Panel data-testid="def" />
        <Panel data-testid="inset" variant="inset" />
        <Banner data-testid="gold" />
        <Banner data-testid="red" tone="red" />
      </div>,
    );
    expect(screen.getByTestId("def").className).not.toBe(screen.getByTestId("inset").className);
    expect(screen.getByTestId("gold").className).not.toBe(screen.getByTestId("red").className);
  });

  it("Badge accepts rarity tones", () => {
    render(<Badge tone="rare" data-testid="r">Rare</Badge>);
    expect(screen.getByTestId("r").className).toContain("rarity-rare");
  });
});

describe("Button", () => {
  it("asChild renders the child element with button classes", () => {
    render(<Button asChild className="mine"><a href="/x">go</a></Button>);
    const link = screen.getByRole("link", { name: "go" });
    expect(link.tagName).toBe("A");
    expect(link.className).toContain("mine");
    expect(link.className).toContain("font-spire-display");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Tooltip", () => {
  it("opens on keyboard focus with role=tooltip", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip>
        <TooltipTrigger asChild><button>hover me</button></TooltipTrigger>
        <TooltipContent className="x-tip">Helpful text</TooltipContent>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Helpful text");
    expect(document.querySelector(".x-tip")).not.toBeNull();
  });
});

describe("Dialog", () => {
  it("traps focus and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Dialog>
          <DialogTrigger>open</DialogTrigger>
          <DialogContent className="x-dialog">
            <DialogTitle>Title</DialogTitle>
            <button>first</button>
            <button>second</button>
          </DialogContent>
        </Dialog>
        <button>outside</button>
      </div>,
    );
    await user.click(screen.getByText("open"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("x-dialog");
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
