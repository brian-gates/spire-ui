import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatEnergy, StatGold, StatHP } from "../../../registry/spire/game/stat";

const meta = {
  title: "Game/Stats",
  component: StatHP,
  args: { current: 72, max: 92 },
} satisfies Meta<typeof StatHP>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HP: Story = {};
export const HPUnknownCurrent: Story = { args: { current: null } };
export const HPUnknownBoth: Story = { args: { current: null, max: null } };
export const Gold: Story = { render: () => <StatGold value={133} /> };
export const GoldUnknown: Story = { render: () => <StatGold value={null} /> };
export const Energy: Story = { render: () => <StatEnergy value={3} /> };
export const EnergyUnknown: Story = { render: () => <StatEnergy value={null} /> };
export const TopBar: Story = {
  render: () => <div className="flex gap-6"><StatHP current={72} max={92} /><StatGold value={133} /><StatEnergy value={3} /></div>,
};
