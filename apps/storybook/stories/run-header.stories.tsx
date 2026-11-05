import type { Meta, StoryObj } from "@storybook/react-vite";
import { RunHeader } from "../../../registry/spire/game/run-header";

const meta = {
  title: "Game/RunHeader",
  component: RunHeader,
  args: { run: { act: 2, floor: 21, ascension: 2, mode: "regular", savedAt: new Date(Date.now() - 3 * 3_600_000), savedBy: "Bo" } },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="@container w-full max-w-3xl"><Story /></div>],
} satisfies Meta<typeof RunHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const ModdedEnded: Story = { args: { run: { act: 3, floor: 40, ascension: 10, mode: "modded", ended: true } } };
