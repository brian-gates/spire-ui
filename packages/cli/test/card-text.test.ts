import { describe, expect, test } from "vitest";
import { renderCardText, type TextContext } from "../src/card-text";

const ctx = (vars: TextContext["vars"], extra: Partial<TextContext> = {}): TextContext => ({ vars, upgraded: false, ...extra });
const both = (template: string, c: TextContext) => [renderCardText(template, c).text, renderCardText(template, { ...c, upgraded: true }).text];

// Invented templates in the game's format; no game text.
describe("card text", () => {
  test("{Var}, {Var:diff()}, {Var:inverseDiff()} with base and upgraded values", () => {
    const c = ctx({ Damage: { base: 6, upgraded: 9 }, Loss: { base: 2, upgraded: 1 }, Hp: { base: 3 } });
    expect(both("Hit for {Damage:diff()}, lose {Loss:inverseDiff()}, pay {Hp} HP.", c)).toEqual(["Hit for 6, lose 2, pay 3 HP.", "Hit for 9, lose 1, pay 3 HP."]);
  });

  test("plural, with {} and {:diff()} meaning the value inside an option", () => {
    const c = ctx({ Cards: { base: 1, upgraded: 2 } });
    expect(both("Draw {Cards:diff()} {Cards:plural:card|cards}.", c)).toEqual(["Draw 1 card.", "Draw 2 cards."]);
    expect(both("Next {Cards:plural:card is|{:diff()} cards are} free.", c)).toEqual(["Next card is free.", "Next 2 cards are free."]);
    expect(both("Repeat{Cards:plural:| {} times}.", c)).toEqual(["Repeat.", "Repeat 2 times."]);
  });

  test("IfUpgraded:show, nested inside plural", () => {
    const c = ctx({ Cards: { base: 1, upgraded: 2 } });
    expect(both("Add {Cards:plural:{IfUpgraded:show:Blade+|Blade}|{IfUpgraded:show:Blades+|Blades}}.", c)).toEqual(["Add Blade.", "Add Blades+."]);
    expect(both("Gain{IfUpgraded:show: more} gold.", c)).toEqual(["Gain gold.", "Gain more gold."]);
  });

  test("energy and star icons as words", () => {
    const c = ctx({ Energy: { base: 2 }, Stars: { base: 1, upgraded: 3 } });
    expect(renderCardText("Gain {Energy:energyIcons()}. Gain {Stars:starIcons()}.", c).text).toBe("Gain 2 Energy. Gain 1 Star.");
    expect(renderCardText("Gain {Stars:starIcons()}.", { ...c, upgraded: true }).text).toBe("Gain 3 Stars.");
    expect(renderCardText("Costs 0{energyPrefix:energyIcons(1)}. Every {energyPrefix:energyIcons(4)} spent. Spend {singleStarIcon}, 2{singleStarIcon}.", c).text).toBe(
      "Costs 0 Energy. Every 4 Energy spent. Spend Star, 2 Star.",
    );
  });

  test("implicit conditionals, cond comparisons and choose", () => {
    const c = ctx({ Attacks: { base: 1, upgraded: 2 }, Flag: { base: 1 } }, { type: "Skill", target: "AllEnemies" });
    expect(both("Next {Attacks:cond:>1?{Attacks:diff()} Attacks are|Attack is} doubled.", c)).toEqual(["Next Attack is doubled.", "Next 2 Attacks are doubled."]);
    expect(renderCardText("A{InCombat:\n(in combat)|}{IsTargeting: (aimed)|}.{Flag: Yes|No}", c).text).toBe("A. Yes");
    expect(renderCardText("{CardType:choose(Attack|Skill):Hit.|Block.|Other.} Hit{TargetType:choose(AllEnemies): ALL|}.", c).text).toBe("Block. Hit ALL.");
    expect(renderCardText("{CardType:choose(Attack):Hit.|Other.}", ctx({}, { type: "Power" })).text).toBe("Other.");
  });

  test("markup is removed and whitespace collapsed; nothing is passed through as markup", () => {
    const c = ctx({ Block: { base: 5 } });
    expect(renderCardText("Gain [gold]{Block}[/gold] [blue]Block[/blue].\n  Then [purple]rest[/purple].", c).text).toBe("Gain 5 Block. Then rest.");
  });

  test("computed vars show their base when known, else X; unknown vars are reported", () => {
    const c = ctx({ Calc: { computed: true }, Base: { base: 4, computed: true } });
    expect(renderCardText("Deal {Calc:diff()} and {Base}.", c)).toEqual({ text: "Deal X and 4.", unresolved: [] });
    expect(renderCardText("Deal {Missing:diff()} {Missing:plural:time|times}.{Rider: Extra.|}", c)).toEqual({ text: "Deal X times.", unresolved: ["Missing", "Rider"] });
  });

  test("malformed templates render nothing rather than garbage", () => {
    expect(renderCardText("Deal {Damage", ctx({}))).toEqual({ text: "", unresolved: ["<template>"] });
    expect(renderCardText("{a b}", ctx({}))).toEqual({ text: "", unresolved: ["<template>"] });
    expect(renderCardText("{X:energyIcons(abc)}", ctx({})).unresolved).toEqual(["<template>"]);
    const deep = `${"{IfUpgraded:show:".repeat(40)}x${"}".repeat(40)}`;
    expect(renderCardText(deep, ctx({}, { upgraded: true })).unresolved).toEqual(["<template>"]);
  });
});
