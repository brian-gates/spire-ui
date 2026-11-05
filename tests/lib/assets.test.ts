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

describe("parseManifest", () => {
  it("accepts valid", () => expect(parseManifest(manifest)).toEqual(manifest));
  it("rejects bad", () => {
    expect(parseManifest({ schemaVersion: 2 })).toBeNull();
    expect(parseManifest("x")).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...manifest, items: { "RELIC.A": { kind: "relic", w: 1, h: 1 } } })).toBeNull();
  });
});
