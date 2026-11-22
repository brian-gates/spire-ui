import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogRow } from "../../../registry/spire/game/log-row";
import { SpireIcon } from "../../../registry/spire/ui/spire-icon";

const meta = {
  title: "Game/LogRow",
  component: LogRow,
  args: { children: "Strike → Leaf Slime (M)", amount: "6", tone: "dealt", fraction: 6 / 11, icon: <SpireIcon id="CARD.STRIKE_IRONCLAD" size={22} /> },
  parameters: { layout: "padded" },
  decorators: [(Story) => <ol className="@container m-0 grid w-full max-w-3xl list-none p-0"><Story /></ol>],
} satisfies Meta<typeof LogRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dealt: Story = {};
export const Taken: Story = { args: { children: "Leaf Slime (M)", amount: "8", tone: "taken", fraction: 8 / 11, icon: undefined } };
export const Saved: Story = { args: { children: "Twig Slime (M)", amount: "11 saved", tone: "saved", fraction: 1, icon: undefined } };
export const Healed: Story = { args: { children: undefined, amount: "+6", tone: "healed", icon: <span className="font-spire-display text-lg font-bold text-spire-healed">+</span> } };
export const Potion: Story = { args: { children: "Fire Potion used → Cultist", amount: undefined, tone: "neutral", fraction: 0, icon: <SpireIcon id="POTION.FIRE_POTION" size={22} /> } };
export const CoopAccent: Story = { args: { accent: "var(--color-class-silent)", children: <>Cultist → <span className="text-class-silent">Bo</span></>, amount: "9", tone: "taken", fraction: 9 / 11, icon: undefined } };
export const LongText: Story = { args: { children: "A card with a very long name → An enemy with an even longer name (M)", amount: "1,204", fraction: 1 } };
export const Phone: Story = { decorators: [(Story) => <div className="w-[342px]"><Story /></div>] };
