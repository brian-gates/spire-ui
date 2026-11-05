import { describe, expect, it } from "vitest";
import { kindOf, parseManifest, resolveAsset, tidyId, type SpireManifest } from "../../registry/spire/lib/assets";

const manifest: SpireManifest = {
  schemaVersion: 1,
  gameVersion: "1",
  generatedAt: "now",
  items: { "RELIC.A": { kind: "relic", file: "relics/a.png", w: 8, h: 9, name: "Alpha", description: "d" } },
};

describe("tidyId", () => {
  it("title-cases with small words", () => {
    expect(tidyId("RELIC.RING_OF_THE_SNAKE")).toBe("Ring of the Snake");
    expect(tidyId("POTION.FAIRY_IN_A_BOTTLE")).toBe("Fairy in a Bottle");
    expect(tidyId("CHARACTER.IRONCLAD")).toBe("Ironclad");
    expect(tidyId("weird")).toBe("Weird");
    expect(tidyId("RELIC.THE_BOOT")).toBe("The Boot");
  });
});

describe("kindOf", () => {
  it("maps prefixes", () => {
    expect(kindOf("CHARACTER.X")).toBe("class");
    expect(kindOf("ROOM.X")).toBe("room");
    expect(kindOf("RELIC.X")).toBe("relic");
    expect(kindOf("POTION.X")).toBe("potion");
    expect(kindOf("CARD.X")).toBe("card");
    expect(kindOf("STAT.HP")).toBe("ui");
  });
  it("ignores inherited Object.prototype names", () => {
    for (const id of ["constructor", "__proto__", "toString", "constructor.X", "__proto__.X"]) expect(kindOf(id)).toBe("ui");
  });
});

describe("resolveAsset", () => {
  it("extracted for known id", () => {
    expect(resolveAsset("RELIC.A", manifest, "/art")).toEqual({
      source: "extracted", src: "/art/relics/a.png", name: "Alpha", description: "d", w: 8, h: 9,
    });
  });
  it("fallback for unknown id and null manifest", () => {
    expect(resolveAsset("RELIC.RING_OF_THE_SNAKE", manifest, "/art")).toEqual({
      source: "fallback", fallback: "relic", name: "Ring of the Snake",
    });
    expect(resolveAsset("POTION.X", null, "/art")).toEqual({ source: "fallback", fallback: "potion", name: "X" });
  });
});

describe("resolveAsset hardening", () => {
  it("falls back for ids that are Object.prototype members", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(resolveAsset(id, manifest, "/art").source).toBe("fallback");
    }
  });
  it("strips leading slashes from file", () => {
    const m = { ...manifest, items: { "RELIC.A": { kind: "relic" as const, file: "//relics/a.png", w: 1, h: 1 } } };
    expect(resolveAsset("RELIC.A", m, "/art/")).toMatchObject({ src: "/art/relics/a.png" });
  });
});

describe("parseManifest", () => {
  it("drops non-string name/description but keeps the item", () => {
    const parsed = parseManifest({ ...manifest, items: { "RELIC.A": { kind: "relic", file: "a.png", w: 1, h: 1, name: 5, description: {} } } });
    expect(parsed?.items["RELIC.A"]).toEqual({ kind: "relic", file: "a.png", w: 1, h: 1 });
    expect(resolveAsset("RELIC.A", parsed, "/art")).toMatchObject({ source: "extracted", name: "A" });
  });
  it("drops items with an unknown kind", () => {
    const parsed = parseManifest({ ...manifest, items: { "RELIC.A": { kind: "bogus", file: "a.png", w: 1, h: 1 }, "RELIC.B": { kind: "relic", file: "b.png", w: 1, h: 1 } } });
    expect(Object.keys(parsed!.items)).toEqual(["RELIC.B"]);
  });
  it("keeps a __proto__ item id as an own property only", () => {
    const parsed = parseManifest(JSON.parse('{"schemaVersion":1,"gameVersion":"1","generatedAt":"n","items":{"__proto__":{"kind":"ui","file":"x.png","w":1,"h":1}}}'));
    expect(Object.hasOwn(parsed!.items, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).file).toBeUndefined();
  });
  it("keeps a card's well-typed stats and drops the rest", () => {
    const item = { kind: "card", file: "c.webp", w: 2, h: 1 };
    const parsed = parseManifest({
      ...manifest,
      items: {
        "CARD.A": {
          ...item,
          card: {
            cost: "X",
            upgradedCost: "1",
            starCost: 2,
            type: "Attack",
            rarity: "Common",
            target: 3,
            pool: "ironclad",
            keywords: ["Exhaust", 5],
            upgradedKeywords: ["Retain"],
            vars: { Damage: { base: 5, upgraded: 8 }, Calc: { computed: true, base: "7" }, Bad: 4 },
            description: "Deal 5 damage.",
            upgradedDescription: ["no"],
            unknown: ["target"],
            extra: "ignored",
          },
        },
        "CARD.B": { ...item, card: { cost: 1, type: "Skill" } },
        "CARD.C": { ...item, card: { cost: Number.NaN, type: "Skill", rarity: "Rare" } },
        "CARD.D": { ...item, card: { cost: null, type: "Curse", rarity: "Curse" } },
      },
    });
    expect(parsed!.items["CARD.A"]!.card).toEqual({
      cost: "X",
      starCost: 2,
      type: "Attack",
      rarity: "Common",
      pool: "ironclad",
      upgradedKeywords: ["Retain"],
      vars: { Damage: { base: 5, upgraded: 8 }, Calc: { computed: true } },
      description: "Deal 5 damage.",
      unknown: ["target"],
    });
    // Without a valid cost, type and rarity the card stats are dropped; the item (its art) stays.
    expect(parsed!.items["CARD.B"]).toEqual(item);
    expect(parsed!.items["CARD.C"]).toEqual(item);
    expect(parsed!.items["CARD.D"]!.card).toEqual({ cost: null, type: "Curse", rarity: "Curse" });
    expect(resolveAsset("CARD.A", parsed, "/art")).toMatchObject({ source: "extracted", card: { cost: "X" } });
    expect(resolveAsset("CARD.B", parsed, "/art")).not.toHaveProperty("card");
  });
  it("accepts valid", () => expect(parseManifest(manifest)).toEqual(manifest));
  it("rejects bad", () => {
    expect(parseManifest({ schemaVersion: 2 })).toBeNull();
    expect(parseManifest("x")).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...manifest, items: { "RELIC.A": { kind: "relic", w: 1, h: 1 } } })).toBeNull();
  });
});
