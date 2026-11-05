// The manifest `extract-art` writes. A copy of the resolver's types in
// registry/spire/lib/assets.ts (the CLI ships separately from that copy-in code);
// test/manifest-sync.test.ts fails if the two drift apart.
export type AssetKind = "relic" | "potion" | "card" | "class" | "room" | "ui";
export interface ManifestItem {
  kind: AssetKind; file: string; w: number; h: number; name?: string; description?: string;
}
export interface SpireManifest {
  schemaVersion: 1; gameVersion: string; generatedAt: string;
  items: Record<string, ManifestItem>;
  fonts?: { display?: string; body?: string };
}

export const ASSET_KINDS: readonly AssetKind[] = ["relic", "potion", "card", "class", "room", "ui"];
