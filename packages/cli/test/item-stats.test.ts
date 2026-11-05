import { describe, expect, test } from "vitest";
import { UnsupportedBuildError } from "../src/card-stats";
import { Assembly, DotnetError } from "../src/dotnet/metadata";
import { Model } from "../src/dotnet/model";
import { readItems, toItemStats } from "../src/item-stats";
import { buildGameAssembly } from "./game-assembly";

const model = () => new Model(new Assembly(buildGameAssembly()));

describe("relic and potion facts from IL", () => {
  test("rarity, pool and a named var; text rendered with the real number", () => {
    const relics = readItems(model(), "relic");
    const f = relics.get("RELIC.LAMP_TEST")!;
    expect(f).toMatchObject({ className: "LampTest", rarity: "Common", pool: "ember", vars: { Cards: { base: 2 } }, unknown: [] });
    expect(toItemStats(f, "Draw [blue]{Cards}[/blue] more {Cards:plural:card|cards} at the [gold]start[/gold].")).toEqual({
      rarity: "Common",
      pool: "ember",
      description: "Draw 2 more cards at the start.",
      descriptionRuns: [{ text: "Draw " }, { text: "2", style: "blue" }, { text: " more cards at the " }, { text: "start", style: "gold" }, { text: "." }],
    });
  });

  test("a relic two pools list has no pool; a var read from instance state is computed, never made up", () => {
    const f = readItems(model(), "relic").get("RELIC.CHARM_TEST")!;
    expect(f).toMatchObject({ rarity: "Rare", vars: { Damage: { computed: true } }, unknown: ["pool"] });
    expect(toItemStats(f, "Deal {Damage} damage.")).toEqual({ rarity: "Rare", description: "Deal X damage.", descriptionRuns: [{ text: "Deal X damage." }], unknown: ["pool"] });
  });

  test("unrecognised patterns are left out and named in unknown", () => {
    const f = readItems(model(), "relic").get("RELIC.ODD_RELIC_TEST")!;
    expect(f.rarity).toBeUndefined();
    expect(f.unknown).toEqual(["rarity", "vars"]);
    expect(f.reasons.join("; ")).toMatch(/opcode 0x6/);
    expect(toItemStats(f, "Gain {Block} Block.")).toEqual({ pool: "ember", description: "Gain X Block.", descriptionRuns: [{ text: "Gain X Block." }], unknown: ["rarity", "vars", "description"] });
  });

  test("potions: rarity, a decimal var, and a pool listed through a static getter", () => {
    const f = readItems(model(), "potion").get("POTION.TONIC_TEST")!;
    expect(toItemStats(f, "Deal [blue]{Damage}[/blue] damage.")).toEqual({
      rarity: "Rare",
      pool: "ember",
      description: "Deal 20 damage.",
      descriptionRuns: [{ text: "Deal " }, { text: "20", style: "blue" }, { text: " damage." }],
    });
  });

  test("a build without RelicModel is unsupported for relics, potions unaffected", () => {
    const m = new Model(new Assembly(buildGameAssembly({ noRelicModel: true })));
    expect(() => readItems(m, "relic")).toThrow(UnsupportedBuildError);
    expect(readItems(m, "potion").has("POTION.TONIC_TEST")).toBe(true);
  });

  test("random corruption yields items, an unsupported build or a DotnetError, nothing else", () => {
    const good = buildGameAssembly();
    let seed = 4242;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 3000; i++) {
      const copy = Buffer.from(good);
      for (let k = 0; k < 1 + rand(6); k++) copy[rand(copy.length)] = rand(256);
      for (const kind of ["relic", "potion"] as const) {
        try {
          readItems(new Model(new Assembly(copy)), kind);
        } catch (e) {
          if (!(e instanceof DotnetError) && !(e instanceof UnsupportedBuildError)) throw new Error(`iteration ${i}: ${(e as Error).stack}`);
        }
      }
    }
  });
});
