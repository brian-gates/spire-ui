import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogRow } from "../../../registry/spire/game/log-row";
import { RoundCard } from "../../../registry/spire/game/round-card";

const meta = {
  title: "Game/RoundCard",
  component: RoundCard,
  args: { round: 2, dealt: 3, taken: 15 },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-full max-w-3xl"><Story /></div>],
} satisfies Meta<typeof RoundCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const plus = <span className="font-spire-display text-lg font-bold text-spire-healed">+</span>;

export const WithRows: Story = {
  render: (args) => (
    <RoundCard {...args}>
      <LogRow icon={plus} amount="+6" tone="healed" fraction={6 / 11} />
      <LogRow amount="3" tone="dealt" fraction={3 / 11}>Lightning → Twig Slime (S)</LogRow>
      <LogRow amount="11 saved" tone="saved" fraction={1}>Twig Slime (M)</LogRow>
      <LogRow amount="8" tone="taken" fraction={8 / 11}>Leaf Slime (M)</LogRow>
      <LogRow amount="3" tone="taken" fraction={3 / 11}>Leaf Slime (S)</LogRow>
    </RoundCard>
  ),
};
export const Empty: Story = {};
export const NoDamage: Story = { args: { dealt: 0, taken: 0 } };
export const AllDealt: Story = { args: { round: 1, dealt: 42, taken: 0 } };
export const Phone: Story = { ...WithRows, decorators: [(Story) => <div className="w-[366px]"><Story /></div>] };
