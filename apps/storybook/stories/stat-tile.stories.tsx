import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatTile, StatTiles } from "../../../registry/spire/game/stat-tile";

const meta = {
  title: "Game/StatTile",
  component: StatTile,
  args: { label: "Dealt", value: 12, tone: "dealt" },
  decorators: [(Story) => <dl className="m-0 grid w-40"><Story /></dl>],
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dealt: Story = {};
export const Taken: Story = { args: { label: "Taken", value: 19, tone: "taken" } };
export const Saved: Story = { args: { label: "Saved", value: 11, tone: "saved", title: "HP your Buffer stopped hits from taking" } };
export const Healed: Story = { args: { label: "Healed", value: 6, tone: "healed" } };
export const Unknown: Story = { args: { label: "Block", value: null, tone: "neutral" } };
export const Grid: Story = {
  decorators: [(Story) => <div className="w-72"><Story /></div>],
  render: () => (
    <StatTiles label="Fight totals">
      <StatTile label="Dealt" value={12} tone="dealt" />
      <StatTile label="Taken" value={19} tone="taken" />
      <StatTile label="Saved" value={11} tone="saved" />
      <StatTile label="Healed" value={6} tone="healed" />
    </StatTiles>
  ),
};
