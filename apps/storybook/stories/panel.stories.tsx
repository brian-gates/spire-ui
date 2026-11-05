import type { Meta, StoryObj } from "@storybook/react-vite";
import { Panel } from "../../../registry/spire/ui/panel";

const meta = {
  title: "Primitives/Panel",
  component: Panel,
  args: { variant: "default", children: "Ancient stone, worn by countless climbs.", className: "w-80" },
  argTypes: { variant: { control: "inline-radio", options: ["default", "inset", "parchment"] } },
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Inset: Story = { args: { variant: "inset" } };
export const Parchment: Story = { args: { variant: "parchment" } };
