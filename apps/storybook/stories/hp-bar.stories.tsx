import type { Meta, StoryObj } from "@storybook/react-vite";
import { HpBar } from "../../../registry/spire/game/hp-bar";

const meta = {
  title: "Game/HpBar",
  component: HpBar,
  args: { current: 80, max: 80 },
  decorators: [(Story) => <div className="w-48"><Story /></div>],
} satisfies Meta<typeof HpBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Half: Story = { args: { current: 40 } };
export const Low: Story = { args: { current: 12, max: 80 } };
export const Overheal: Story = { args: { current: 95, max: 80 } };
export const Block: Story = { args: { current: 62, max: 80, block: 14 } };
export const Unknown: Story = { args: { current: null, max: null } };
export const UnknownCurrent: Story = { args: { current: null, max: 80 } };
export const UnknownMax: Story = { args: { current: 62, max: null } };
export const Sizes: Story = {
  render: () => (
    <div className="grid gap-3">
      <HpBar size="md" current={62} max={80} block={8} />
      <HpBar size="sm" current={62} max={80} block={8} />
      <HpBar size="md" current={31} max={80} />
      <HpBar size="sm" current={31} max={80} />
    </div>
  ),
};
