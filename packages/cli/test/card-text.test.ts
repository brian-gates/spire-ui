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
    expect(both("Pick {Cards:diff()} {Cards:plural:gem|gems}.", c)).toEqual(["Pick 1 gem.", "Pick 2 gems."]);
    expect(both("Next {Cards:plural:gem is|{:diff()} gems are} shiny.", c)).toEqual(["Next gem is shiny.", "Next 2 gems are shiny."]);
    expect(both("Repeat{Cards:plural:| {} times}.", c)).toEqual(["Repeat.", "Repeat 2 times."]);
  });

  test("IfUpgraded:show, nested inside plural", () => {
    const c = ctx({ Cards: { base: 1, upgraded: 2 } });
    expect(both("Find {Cards:plural:{IfUpgraded:show:Pebble+|Pebble}|{IfUpgraded:show:Pebbles+|Pebbles}}.", c)).toEqual(["Find Pebble.", "Find Pebbles+."]);
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
    expect(both("{Attacks:cond:>1?{Attacks:diff()} owls hoot|One owl hoots}.", c)).toEqual(["One owl hoots.", "2 owls hoot."]);
    expect(renderCardText("A{InCombat:\n(in combat)|}{IsTargeting: (aimed)|}.{Flag: Yes|No}", c).text).toBe("A. Yes");
    expect(renderCardText("{CardType:choose(Attack|Skill):Hit.|Block.|Other.} Hit{TargetType:choose(AllEnemies): ALL|}.", c).text).toBe("Block. Hit ALL.");
    expect(renderCardText("{CardType:choose(Attack):Hit.|Other.}", ctx({}, { type: "Power" })).text).toBe("Other.");
  });

  test("markup is removed and whitespace collapsed; nothing is passed through as markup", () => {
    const c = ctx({ Block: { base: 5 } });
    expect(renderCardText("Gain [gold]{Block}[/gold] [blue]Block[/blue].\n  Then [purple]rest[/purple].", c).text).toBe("Gain 5 Block. Then rest.");
  });

  test("runs keep line breaks, the game's colour tags and its coloured numbers, upgraded ones marked", () => {
    const c = ctx({ Damage: { base: 6, upgraded: 9 }, Weak: { base: 1 } });
    const t = "Deal {Damage:diff()} damage.\n  Apply {Weak:diff()} [gold]Weak[/gold]. [blue]{Weak}[/blue]";
    expect(renderCardText(t, c).runs).toEqual([
      { text: "Deal " },
      { text: "6", style: "number" },
      { text: " damage.\nApply " },
      { text: "1", style: "number" },
      { text: " " },
      { text: "Weak", style: "gold" },
      { text: ". " },
      { text: "1", style: "blue" },
    ]);
    const up = renderCardText(t, { ...c, upgraded: true });
    expect(up.runs.filter((r) => r.style === "upgraded" || r.style === "number")).toEqual([
      { text: "9", style: "upgraded" },
      { text: "1", style: "number" },
    ]);
    expect(up.text).toBe("Deal 9 damage. Apply 1 Weak. 1");
    // A diff value inside a colour tag takes the innermost style; stray marker characters are dropped.
    expect(renderCardText("[gold]{Damage:diff()} x\u0001g[/gold]", c).runs).toEqual([{ text: "6", style: "number" }, { text: " xg", style: "gold" }]);
  });

  test("computed vars show their base when known, else X; unknown vars are reported", () => {
    const c = ctx({ Calc: { computed: true }, Base: { base: 4, computed: true } });
    expect(renderCardText("Deal {Calc:diff()} and {Base}.", c)).toMatchObject({ text: "Deal X and 4.", unresolved: [] });
    expect(renderCardText("Deal {Missing:diff()} {Missing:plural:time|times}.{Rider: Extra.|}", c)).toMatchObject({ text: "Deal X times.", unresolved: ["Missing", "Rider"] });
  });

  test("relic text: percentMore, an unset StringValue as a condition, unknown formatters", () => {
    const c = ctx({ Increase: { base: 1.25 }, Half: { base: 1.125 }, Picked: {} });
    expect(renderCardText("Gain [blue]{Increase:percentMore()}%[/blue] more.", c)).toMatchObject({ text: "Gain 25% more.", unresolved: [] });
    // Rounded half to even, as Convert.ToInt32(decimal) does.
    expect(renderCardText("{Half:percentMore()}", c).text).toBe("12");
    expect(renderCardText("Take {Picked.StringValue:cond:[gold]{Picked}[/gold]|a card} home.", c)).toMatchObject({ text: "Take a card home.", unresolved: [] });
    expect(renderCardText("Take {Picked.StringValue} home.", c)).toMatchObject({ text: "Take X home.", unresolved: ["Picked.StringValue"] });
    expect(renderCardText("Take {Other.StringValue:cond:x|y}.", c).unresolved).toEqual(["Other.StringValue"]);
    expect(renderCardText("Gain {Increase:sparkle()} more.", c)).toMatchObject({ text: "Gain X more.", unresolved: ["Increase"] });
  });

  test("malformed templates render nothing rather than garbage", () => {
    expect(renderCardText("Deal {Damage", ctx({}))).toEqual({ text: "", runs: [], unresolved: ["<template>"] });
    expect(renderCardText("{a b}", ctx({}))).toEqual({ text: "", runs: [], unresolved: ["<template>"] });
    expect(renderCardText("{X:energyIcons(abc)}", ctx({})).unresolved).toEqual(["<template>"]);
    const deep = `${"{IfUpgraded:show:".repeat(40)}x${"}".repeat(40)}`;
    expect(renderCardText(deep, ctx({}, { upgraded: true })).unresolved).toEqual(["<template>"]);
  });
});
