import { describe, expect, it } from "vitest";
import { fallbackKeyFor } from "../../registry/spire/icons/fallback-keys";

describe("fallbackKeyFor", () => {
  it("maps prefixes to keys", () => {
    expect(fallbackKeyFor("RELIC.X")).toBe("relic");
    expect(fallbackKeyFor("POTION.X")).toBe("potion");
    expect(fallbackKeyFor("CARD.X")).toBe("card");
    expect(fallbackKeyFor("CHARACTER.REGENT")).toBe("class.regent");
    expect(fallbackKeyFor("CHARACTER.MODDED")).toBe("class.unknown");
    expect(fallbackKeyFor("ROOM.ELITE")).toBe("room.elite");
    expect(fallbackKeyFor("ROOM.WEIRD")).toBe("room.unknown");
    expect(fallbackKeyFor("STAT.GOLD")).toBe("stat.gold");
    expect(fallbackKeyFor("whatever")).toBe("relic");
  });
});

describe("stat.ascension", () => {
  it("maps STAT.ASCENSION to its own glyph", () => {
    expect(fallbackKeyFor("STAT.ASCENSION")).toBe("stat.ascension");
  });
});

describe("stat.deck", () => {
  it("maps STAT.DECK to its own glyph", () => {
    expect(fallbackKeyFor("STAT.DECK")).toBe("stat.deck");
  });
});
