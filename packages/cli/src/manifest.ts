// The manifest `extract-art` writes. A copy of the resolver's types in
// registry/spire/lib/assets.ts (the CLI ships separately from that copy-in code);
// test/manifest-sync.test.ts fails if the two drift apart.
export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
/** One of a card's numbers. `computed`: the game recalculates it at runtime (base shown when known). */
export interface CardVar {
  base?: number; upgraded?: number; computed?: boolean;
}
/** A card's stats, read from the game's code. Fields that could not be read are left out and named in `unknown`. */
export interface CardStats {
  /** Energy cost; "X" for X-cost cards, null for unplayable ones. */
  cost: number | "X" | null; upgradedCost?: number; starCost?: number;
  type: string; rarity: string; target?: string; pool?: string; frame?: string;
  keywords?: string[]; upgradedKeywords?: string[];
  vars?: Record<string, CardVar>;
  description?: string; upgradedDescription?: string;
  unknown?: string[];
}
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
  card?: CardStats;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
}

export const ASSET_KINDS: readonly AssetKind[] = ["relic", "potion", "card", "class", "room", "ui"];
