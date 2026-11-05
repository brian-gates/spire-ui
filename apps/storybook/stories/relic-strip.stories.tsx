import type { Meta, StoryObj } from "@storybook/react-vite";
import { RelicStrip } from "../../../registry/spire/game/relic-strip";

const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `RELIC.EXAMPLE_RELIC_${i + 1}` }));

const meta = {
  title: "Game/RelicStrip",
  component: RelicStrip,
  args: { relics: make(5), max: 8 },
  argTypes: { max: { control: { type: "number", min: 1, max: 50 } } },
  decorators: [(Story) => <div className="max-w-md p-6"><Story /></div>],
} satisfies Meta<typeof RelicStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Five: Story = {};
export const None: Story = { args: { relics: [] } };
export const Unknown: Story = { args: { relics: undefined } };
export const Forty: Story = { args: { relics: make(40) } };
export const UnknownAndModded: Story = {
  args: { relics: [{ id: "RELIC.BURNING_BLOOD" }, { id: "RELIC.MODDED_THING_OF_DOOM" }, { id: "WEIRD" }, { id: "RELIC.THE_ODD_ONE" }] },
};
