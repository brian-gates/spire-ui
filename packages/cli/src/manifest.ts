// The manifest `extract-art` writes. A copy of the resolver's types in
// registry/spire/lib/assets.ts (the CLI ships separately from that copy-in code);
// test/manifest-sync.test.ts fails if the two drift apart.
export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
/** One of a card's numbers. `computed`: the game recalculates it at runtime (base shown when known). */
export interface CardVar {
  base?: number; upgraded?: number; computed?: boolean;
}
/** A run of card text: plain, a number the game colours ("upgraded" when the upgrade changed it), or a game colour tag. */
export interface CardTextRun {
  text: string; style?: "number" | "upgraded" | "gold" | "blue" | "purple";
}
/** A card's stats, read from the game's code. Fields that could not be read are left out and named in `unknown`. */
export interface CardStats {
  /** Energy cost; "X" for X-cost cards, null for unplayable ones. */
  cost: number | "X" | null; upgradedCost?: number; starCost?: number;
  type: string; rarity: string; target?: string; pool?: string; frame?: string;
  keywords?: string[]; upgradedKeywords?: string[];
  vars?: Record<string, CardVar>;
  description?: string; upgradedDescription?: string;
  /** The descriptions as styled runs, line breaks kept (`\n`). */
  descriptionRuns?: CardTextRun[]; upgradedDescriptionRuns?: CardTextRun[];
  unknown?: string[];
}
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
  /**
   * Pixel widths of every file for this item, ascending; each lives at `file` with `@<width>` in
   * place of the last one (the largest, which is `file`). Absent in manifests written before it existed.
   */
  widths?: number[];
  card?: CardStats;
}
/** A box in the game's card scene, in its pixels from the frame's top left; `fontSize` for text. */
export interface CardLayoutBox {
  x: number; y: number; w: number; h: number; fontSize?: number;
}
/**
 * The game's card layout: frame size (300 x 422) and boxes by name (frame, portrait, portraitBorder,
 * banner, title, plaque, orb, star, text), read from its card scene alongside the UI.CARD_* pieces.
 */
export interface CardLayout {
  w: number; h: number; boxes: Record<string, CardLayoutBox>;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
  cardLayout?: CardLayout;
}

export const ASSET_KINDS: readonly AssetKind[] = ["relic", "potion", "card", "class", "room", "ui"];
