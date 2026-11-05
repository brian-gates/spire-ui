import type { Meta, StoryObj } from "@storybook/react-vite";
import { GameCard } from "../../../registry/spire/game/game-card";
import type { SpireManifest } from "../../../registry/spire/lib/assets";
import { SpireAssets } from "../../../registry/spire/lib/assets-provider";

// Invented card stats (no game text): enough for GameCard to draw its fallback, or the game's
// pieces when your own extracted art is served at ./local-art (see .storybook/main.ts).
const stats: SpireManifest = {
  schemaVersion: 1,
  gameVersion: "example",
  generatedAt: "2026-01-01T00:00:00.000Z",
  items: {
    "CARD.EXAMPLE_STRIKE": {
      kind: "card",
      file: "card/missing@1.webp",
      w: 1,
      h: 1,
      name: "Example Strike",
      card: {
        cost: 2,
        upgradedCost: 1,
        type: "Attack",
        rarity: "Rare",
        frame: "card_frame_red",
        keywords: ["Exhaust"],
        vars: { Damage: { base: 5, upgraded: 7 } },
        description: "Deal 5 damage. Apply 1 Weak.",
        upgradedDescription: "Deal 7 damage. Apply 1 Weak.",
        descriptionRuns: [{ text: "Deal " }, { text: "5", style: "number" }, { text: " damage.\nApply " }, { text: "1", style: "number" }, { text: " " }, { text: "Weak", style: "gold" }, { text: "." }],
        upgradedDescriptionRuns: [{ text: "Deal " }, { text: "7", style: "upgraded" }, { text: " damage.\nApply " }, { text: "1", style: "number" }, { text: " " }, { text: "Weak", style: "gold" }, { text: "." }],
      },
    },
  },
};

const meta = {
  title: "Game/GameCard",
  component: GameCard,
  parameters: { layout: "padded" },
  args: { id: "CARD.EXAMPLE_STRIKE", upgrades: 0, width: 240, className: "w-60" },
} satisfies Meta<typeof GameCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No card pieces in the manifest: the original CardFrame, with the card's text below it. */
export const Fallback: Story = {
  render: (a) => (
    <SpireAssets base="./none" manifest={stats}>
      <div className="flex gap-6">
        <GameCard {...a} />
        <GameCard {...a} upgrades={1} />
      </div>
    </SpireAssets>
  ),
};

const LOCAL = ["CARD.TEAR_ASUNDER", "CARD.BLADE_DANCE", "CARD.INFLAME", "CARD.FINESSE", "CARD.ASCENDERS_BANE", "CARD.GLOW"];

/**
 * Your own extracted art (`spire-ui extract-art --kinds card,ui --out spire-art` at the repo root):
 * the game's frame, banner, orb and plaque. Shows the fallback when there is none.
 */
export const ExtractedPieces: Story = {
  render: (a) => (
    <SpireAssets base="./local-art" manifestUrl="./local-art/manifest.json">
      <div className="flex flex-wrap gap-8 p-4">
        {LOCAL.map((id, i) => (
          <GameCard key={id} {...a} id={id} upgrades={i % 2} />
        ))}
      </div>
    </SpireAssets>
  ),
};

/** Scales with its container: the same card at three widths. */
export const Fluid: Story = {
  render: (a) => (
    <SpireAssets base="./local-art" manifestUrl="./local-art/manifest.json">
      <div className="flex items-start gap-6">
        {[160, 240, 360].map((w) => (
          <div key={w} style={{ width: w }}>
            <GameCard {...a} id="CARD.TEAR_ASUNDER" upgrades={1} width={w} className="w-full" />
          </div>
        ))}
      </div>
    </SpireAssets>
  ),
};
