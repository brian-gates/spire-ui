import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banner } from "../../../registry/spire/ui/banner";

const meta = {
  title: "Primitives/Banner",
  component: Banner,
  args: { tone: "gold", children: "Victory", className: "w-96" },
  argTypes: { tone: { control: "inline-radio", options: ["gold", "red", "blue"] } },
} satisfies Meta<typeof Banner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Gold: Story = {};
export const Red: Story = { args: { tone: "red", children: "Defeat" } };
export const Blue: Story = { args: { tone: "blue", children: "Rest Site" } };
