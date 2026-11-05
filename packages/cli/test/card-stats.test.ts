import { describe, expect, test } from "vitest";
import { cardId, readCards, toCardStats, UnsupportedBuildError } from "../src/card-stats";
import { Assembly, DotnetError } from "../src/dotnet/metadata";
import { Model } from "../src/dotnet/model";
import { buildGameAssembly } from "./game-assembly";

const cards = () => readCards(new Model(new Assembly(buildGameAssembly())));
const stats = (id: string, template?: string) => {
  const f = cards().get(id);
  if (!f) throw new Error(`no facts for ${id}`);
  return toCardStats(f, template);
};

describe("card facts from IL", () => {
  test("constructor arguments, a decimal var and an OnUpgrade delta via a DynamicVarSet getter", () => {
    expect(stats("CARD.HAMMER_TEST", "Bonk for {Damage:diff()}.")).toEqual({
      cost: 1,
      type: "Attack",
      rarity: "Basic",
      target: "AnyEnemy",
      pool: "crimson",
      frame: "frame_crimson",
      vars: { Damage: { base: 6, upgraded: 9 } },
      description: "Bonk for 6.",
      upgradedDescription: "Bonk for 9.",
      descriptionRuns: [{ text: "Bonk for " }, { text: "6", style: "number" }, { text: "." }],
      upgradedDescriptionRuns: [{ text: "Bonk for " }, { text: "9", style: "upgraded" }, { text: "." }],
    });
  });

  test("int var with its default name, keyword list, upgrade via DynamicVars[\"Name\"] and Decimal.One", () => {
    expect(stats("CARD.SPARK_TEST", "Toss {Cards:diff()} [gold]{Cards:plural:spark|sparks}[/gold] at the [gold]moon[/gold].")).toMatchObject({
      cost: 1,
      type: "Skill",
      rarity: "Common",
      target: "Self",
      keywords: ["Fleeting"],
      vars: { Cards: { base: 3, upgraded: 4 } },
      description: "Toss 3 sparks at the moon.",
      upgradedDescription: "Toss 4 sparks at the moon.",
    });
  });

  test("X cost, a var array with op_Implicit, a five-part decimal and an explicit name, InitializeArray keywords, keyword upgrades", () => {
    const s = stats("CARD.SPIN_TEST");
    expect(s).toMatchObject({ cost: "X", type: "Attack", rarity: "Uncommon", target: "AllEnemies", keywords: ["Opening", "Fragile"], upgradedKeywords: ["Opening", "Kept"] });
    // IfUpgradedVar is a display switch, not a number: not listed.
    expect(s.vars).toEqual({ Damage: { base: 5, upgraded: 8 }, Ratio: { base: 1.5 } });
    expect(s.upgradedCost).toBeUndefined();
  });

  test("PowerVar<T> is named after T; star cost; energy cost upgrade; frame from VisualCardPool", () => {
    expect(stats("CARD.POWER_TEST")).toMatchObject({
      cost: 2,
      upgradedCost: 1,
      starCost: 3,
      type: "Power",
      rarity: "Rare",
      pool: "crimson",
      frame: "frame_azure",
      vars: { MightPower: { base: 2, upgraded: 3 } },
    });
  });

  test("calculated vars and vars read from instance state are computed, without a made-up value", () => {
    expect(stats("CARD.CALC_TEST", "Bonk for {CalculatedDamage:diff()}.")).toMatchObject({ vars: { CalculatedDamage: { computed: true } }, description: "Bonk for X." });
    const scythe = stats("CARD.GROWTH_TEST");
    expect(scythe.vars).toEqual({ Damage: { computed: true } });
    expect(scythe.unknown).toBeUndefined();
  });

  test("unrecognised patterns are left out and named in unknown, never guessed", () => {
    const f = cards().get("CARD.ODD_TEST")!;
    expect(f.unknown).toEqual(["target", "keywords", "vars", "upgrade"]);
    expect(f.reasons.join("; ")).toMatch(/opcode 0x6/);
    const s = toCardStats(f, "Gain {Block:diff()} Block.");
    expect(s).toEqual({ cost: 1, type: "Skill", rarity: "Common", pool: "crimson", frame: "frame_crimson", description: "Gain X Block.", descriptionRuns: [{ text: "Gain " }, { text: "X", style: "number" }, { text: " Block." }], unknown: ["target", "keywords", "vars", "upgrade", "description"] });
  });

  test("a constructor that is not the plain pattern gives no stats; unplayable and unpooled cards", () => {
    const all = cards();
    expect(all.has("CARD.BAD_CTOR_TEST")).toBe(false);
    expect(toCardStats(all.get("CARD.CURSE_TEST")!, "Unplayable.")).toEqual({
      cost: null,
      type: "Curse",
      rarity: "Curse",
      target: "None",
      description: "Unplayable.",
      descriptionRuns: [{ text: "Unplayable." }],
      unknown: ["pool"],
    });
  });

  test("a build without CardModel's expected constructor is unsupported", () => {
    expect(() => readCards(new Model(new Assembly(buildGameAssembly({ changedCardModelCtor: true }))))).toThrow(UnsupportedBuildError);
  });

  test("calls through references with the wrong arity cost only those fields", () => {
    const all = readCards(new Model(new Assembly(buildGameAssembly({ arityTrap: true }))));
    expect(all.get("CARD.TRAP_TEST")?.unknown).toEqual(["pool", "keywords", "vars", "upgrade"]);
    expect(all.get("CARD.HAMMER_TEST")?.unknown).toEqual([]);
  });

  test("random corruption yields cards, an unsupported build or a DotnetError, nothing else", () => {
    const good = buildGameAssembly();
    let seed = 777;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 5000; i++) {
      const copy = Buffer.from(good);
      for (let k = 0; k < 1 + rand(6); k++) copy[rand(copy.length)] = rand(256);
      try {
        readCards(new Model(new Assembly(copy)));
      } catch (e) {
        if (!(e instanceof DotnetError) && !(e instanceof UnsupportedBuildError)) throw new Error(`iteration ${i}: ${(e as Error).stack}`);
      }
    }
  });

  test("card ids follow the game's class name slugs", () => {
    expect(cardId("MoonToss")).toBe("CARD.MOON_TOSS");
    expect(cardId("HammerOfDoom")).toBe("CARD.HAMMER_OF_DOOM");
  });
});
