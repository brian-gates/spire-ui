// Opt-in check against a real local install of the game: runs only when one is found in Steam's
// usual folders (or SPIRE_UI_GAME_DIR) and not in CI. Reads the user's own files; nothing is kept.
import * as fs from "node:fs";
import { describe, expect, test } from "vitest";
import { readCards, toCardStats } from "../src/card-stats";
import { Assembly } from "../src/dotnet/metadata";
import { Model } from "../src/dotnet/model";
import { defaultGameDirs, findAssembly, findPck } from "../src/game-paths";
import { readPckFile, readPckIndex } from "../src/pck";

const pck = process.env.CI ? null : [process.env.SPIRE_UI_GAME_DIR, ...defaultGameDirs(process.platform, process.env)].filter((d): d is string => !!d).map(findPck).find((p) => p) ?? null;
const dll = pck ? findAssembly(pck) : null;

describe.skipIf(!pck || !dll)("real game install (local only)", () => {
  test("known cards read from the game's code, with text from its localization", async () => {
    const cards = readCards(new Model(new Assembly(fs.readFileSync(dll!))));
    const index = await readPckIndex(pck!);
    const locEntry = index.entries.find((e) => e.path === "localization/eng/cards.json")!;
    const loc = JSON.parse((await readPckFile(pck!, locEntry)).toString("utf8")) as Record<string, string>;
    const stats = (id: string) => toCardStats(cards.get(id)!, loc[`${id.slice("CARD.".length)}.description`]);

    expect(cards.size).toBeGreaterThan(500);
    for (const id of ["CARD.BLADE_DANCE", "CARD.WHIRLWIND", "CARD.STRIKE_IRONCLAD"]) expect(cards.has(id), id).toBe(true);
    expect(stats("CARD.BLADE_DANCE")).toMatchObject({
      cost: 1,
      type: "Skill",
      rarity: "Common",
      target: "Self",
      keywords: ["Exhaust"],
      vars: { Cards: { base: 3, upgraded: 4 } },
    });
    // Text is checked by its numbers only; no game text is kept in the repo.
    const blade = stats("CARD.BLADE_DANCE");
    expect(blade.description).toContain("3");
    expect(blade.upgradedDescription).toContain("4");
    expect(blade.unknown).toBeUndefined();
    expect(stats("CARD.WHIRLWIND")).toMatchObject({ cost: "X", type: "Attack", rarity: "Uncommon", target: "AllEnemies", vars: { Damage: { base: 5, upgraded: 8 } } });
    expect(stats("CARD.STRIKE_IRONCLAD")).toMatchObject({ cost: 1, type: "Attack", rarity: "Basic", target: "AnyEnemy", vars: { Damage: { base: 6, upgraded: 9 } } });
    // Nearly every card is fully understood; the rest say what they lack.
    const partial = [...cards.values()].filter((c) => c.unknown.length);
    expect(partial.length).toBeLessThan(cards.size / 20);
  });
});
