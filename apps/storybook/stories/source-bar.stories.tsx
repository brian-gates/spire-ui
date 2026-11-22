import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceBar } from "../../../registry/spire/game/source-bar";
import { SpireIcon } from "../../../registry/spire/ui/spire-icon";

const meta = {
  title: "Game/SourceBar",
  component: SourceBar,
  args: { name: "Strike", amount: 6, fraction: 0.75, tone: "dealt", icon: <SpireIcon id="CARD.STRIKE_IRONCLAD" size={22} /> },
  decorators: [(Story) => <ul className="m-0 grid w-72 list-none gap-2.5 p-0"><Story /></ul>],
} satisfies Meta<typeof SourceBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dealt: Story = {};
export const Taken: Story = { args: { name: "Twig Slime (S)", amount: 8, fraction: 1, tone: "taken", icon: <span className="text-spire-muted"><SpireIcon id="MONSTER.TWIG_SLIME_S" size={22} tint="currentColor" /></span> } };
export const NoIcon: Story = { args: { icon: undefined, name: "Lightning" } };
export const LongName: Story = { args: { name: "A source with a very long name that has to truncate", amount: 1204, fraction: 0.02 } };
export const TopSources: Story = {
  render: () => (
    <>
      <SourceBar name="Strike" amount={6} fraction={0.75} icon={<SpireIcon id="CARD.STRIKE_IRONCLAD" size={22} />} />
      <SourceBar name="Lightning" amount={6} fraction={0.75} />
      <SourceBar name="Twig Slime (S)" amount={8} fraction={1} tone="taken" />
      <SourceBar name="Leaf Slime (M)" amount={8} fraction={1} tone="taken" />
      <SourceBar name="Leaf Slime (S)" amount={3} fraction={0.375} tone="taken" />
    </>
  ),
};
