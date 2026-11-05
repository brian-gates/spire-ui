import type { Meta, StoryObj } from "@storybook/react-vite";
import { GameTip, ItemTip } from "../../../registry/spire/game/game-tip";
import { RelicStrip } from "../../../registry/spire/game/relic-strip";
import { useSpireManifest, SpireAssets } from "../../../registry/spire/lib/assets-provider";

// Invented names and text (no game text). The extracted stories draw the game's panel and your own
// relics when your extracted art is served at ./local-art (see .storybook/main.ts).
const pebble = {
  title: "Lucky Pebble",
  rarity: { label: "Uncommon Relic", colour: "#87ceeb" },
  runs: [{ text: "At the start of each combat, gain " }, { text: "3", style: "blue" as const }, { text: " " }, { text: "Block", style: "gold" as const }, { text: "." }],
};

const meta = {
  title: "Game/GameTip",
  component: GameTip,
  parameters: { layout: "padded" },
  args: { ...pebble, scale: 0.7 },
  argTypes: { scale: { control: { type: "range", min: 0.4, max: 1.2, step: 0.05 } } },
} satisfies Meta<typeof GameTip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No extracted panel: the kit's own panel with the game's text colours. */
export const Fallback: Story = {};

/** The game's panel from your own extracted art (falls back without it). */
export const ExtractedPanel: Story = {
  render: (a) => (
    <SpireAssets base="./local-art" manifestUrl="./local-art/manifest.json">
      <div className="flex flex-wrap items-start gap-6">
        <GameTip {...a} />
        <GameTip title="Murky Tonic" runs={[{ text: "Heal " }, { text: "5", style: "blue" }, { text: " HP." }]} scale={a.scale ?? 0.7} />
      </div>
    </SpireAssets>
  ),
};

/** The first relics and potions your manifest has stats for, one of each rarity, and a strip to hover. */
function FromManifest() {
  const { manifest } = useSpireManifest();
  if (!manifest) return <p className="text-spire-muted">No extracted art at ./local-art.</p>;
  const seen = new Set<string>();
  const ids = Object.entries(manifest.items)
    .filter(([, item]) => {
      const r = (item.relic ?? item.potion)?.rarity;
      const key = `${item.kind}:${r}`;
      if (!r || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(([id]) => id);
  return (
    <div className="grid gap-6">
      <RelicStrip relics={ids.filter((id) => id.startsWith("RELIC.")).map((id) => ({ id }))} />
      <div className="flex flex-wrap items-start gap-6">
        {ids.map((id) => (
          <ItemTip key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

export const ExtractedItems: Story = {
  render: () => (
    <SpireAssets base="./local-art" manifestUrl="./local-art/manifest.json">
      <FromManifest />
    </SpireAssets>
  ),
};
