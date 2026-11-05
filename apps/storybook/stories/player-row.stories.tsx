import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlayerRow } from "../../../registry/spire/game/player-row";

const meta = {
  title: "Game/PlayerRow",
  component: PlayerRow,
  args: {
    player: {
      id: "a", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 52, maxHp: 80, gold: 214, isYou: true,
      relics: [{ id: "RELIC.BURNING_BLOOD" }, { id: "RELIC.EXAMPLE_RELIC_1" }], potions: [{ id: "POTION.EXAMPLE", slot: 0 }], maxPotionSlots: 3,
    },
  },
  decorators: [(Story) => <div className="@container max-w-3xl p-6"><ul className="m-0 list-none p-0"><Story /></ul></div>],
} satisfies Meta<typeof PlayerRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const Unknown: Story = { args: { player: { id: "b", name: "Bo", character: "CHARACTER.MODDED_HERO" } } };
