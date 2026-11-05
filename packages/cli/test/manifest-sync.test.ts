// The CLI ships separately from the copy-in resolver, so it keeps its own copy of SpireManifest.
// This file only compiles if both copies accept the same full manifest and are the same type; the
// test runs the compiler on it so drift fails `test`, not only `typecheck`.
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { parseManifest, type SpireManifest as RegistryManifest } from "../../../registry/spire/lib/assets";
import type { SpireManifest as CliManifest } from "../src/manifest";

const fixture = {
  schemaVersion: 1,
  gameVersion: "v0.0.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  items: {
    "RELIC.ANCHOR": { kind: "relic", file: "relic/anchor@64.webp", w: 64, h: 64, widths: [32, 64], name: "Anchor", description: "Text." },
    "POTION.X": { kind: "potion", file: "potion/x@64.webp", w: 40, h: 48 },
    "CARD.X": { kind: "card", file: "card/x@64.webp", w: 64, h: 48 },
    "CARD.Y": {
      kind: "card",
      file: "card/y@64.webp",
      w: 64,
      h: 48,
      card: {
        cost: "X",
        upgradedCost: 0,
        starCost: 2,
        type: "Attack",
        rarity: "Common",
        target: "AnyEnemy",
        pool: "crimson",
        frame: "frame_crimson",
        keywords: ["Fleeting"],
        upgradedKeywords: [],
        vars: { Damage: { base: 5, upgraded: 8 }, CalculatedDamage: { computed: true } },
        description: "Bonk for 5.",
        upgradedDescription: "Bonk for 8.",
        unknown: ["target"],
      },
    },
    "CARD.Z": { kind: "card", file: "card/z@64.webp", w: 64, h: 48, card: { cost: null, type: "Curse", rarity: "Curse" } },
    "CHARACTER.X": { kind: "class", file: "class/x@64.webp", w: 64, h: 64 },
    "ROOM.X": { kind: "room", file: "room/x@64.webp", w: 64, h: 64 },
    "STAT.X": { kind: "ui", file: "ui/x@64.webp", w: 64, h: 64 },
  },
  fonts: { display: "fonts/a.ttf", body: "fonts/b.ttf" },
} satisfies CliManifest;

const asCli: CliManifest = fixture;
const asRegistry: RegistryManifest = fixture;
const cliToRegistry: RegistryManifest = asCli;
const registryToCli: CliManifest = asRegistry;

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same: Same<CliManifest, RegistryManifest> = true;
const sameItem: Same<CliManifest["items"][string], RegistryManifest["items"][string]> = true;
const sameCard: Same<NonNullable<CliManifest["items"][string]["card"]>, NonNullable<RegistryManifest["items"][string]["card"]>> = true;

describe("SpireManifest copies", () => {
  test("the CLI's copy and the resolver's copy are the same type", () => {
    const pkg = path.resolve(import.meta.dirname, "..");
    const tsc = path.resolve(pkg, "../../node_modules/.bin/tsc");
    const args = ["--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--types", "node"];
    try {
      execFileSync(tsc, [...args, path.join(pkg, "test/manifest-sync.test.ts")], { cwd: pkg, stdio: "pipe", encoding: "utf8" });
    } catch (e) {
      throw new Error(`the manifest copies differ:\n${(e as { stdout?: string }).stdout ?? String(e)}`);
    }
    expect([same, sameItem, sameCard]).toEqual([true, true, true]);
    expect(parseManifest(cliToRegistry)).toEqual(cliToRegistry);
    expect(registryToCli.schemaVersion).toBe(1);
  });
});
