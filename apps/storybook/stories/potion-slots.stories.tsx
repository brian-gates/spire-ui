import type { Meta, StoryObj } from "@storybook/react-vite";
import { PotionSlots } from "../../../registry/spire/game/potion-slots";

const meta = {
  title: "Game/PotionSlots",
  component: PotionSlots,
  args: { maxSlots: 3, potions: [{ id: "POTION.FIRE_POTION", slot: 0 }, { id: "POTION.BLOCK_POTION", slot: 1 }] },
  argTypes: { maxSlots: { control: { type: "number", min: 0, max: 8 } } },
  decorators: [(Story) => <div className="p-6"><Story /></div>],
} satisfies Meta<typeof PotionSlots>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { potions: [] } };
export const WithGap: Story = { args: { potions: [{ id: "POTION.FIRE_POTION", slot: 2 }] } };
export const SlotBeyondMax: Story = {
  args: { maxSlots: 2, potions: [{ id: "POTION.FIRE_POTION", slot: 0 }, { id: "POTION.MODDED_BREW", slot: 4 }] },
};
