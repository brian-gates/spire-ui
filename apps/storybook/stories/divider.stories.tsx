import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "../../../registry/spire/ui/divider";

const meta = {
  title: "Primitives/Divider",
  component: Divider,
  render: (args) => (
    <div className="w-80">
      <p>Above</p>
      <Divider {...args} />
      <p>Below</p>
    </div>
  ),
} satisfies Meta<typeof Divider>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
