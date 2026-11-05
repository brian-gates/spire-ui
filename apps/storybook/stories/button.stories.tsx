import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../../registry/spire/ui/button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { variant: "primary", size: "md", children: "Embark" },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const AllVariantsAndSizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {(["primary", "secondary", "ghost"] as const).map((v) => (
        <div key={v} className="flex items-center gap-3">
          {(["sm", "md", "lg"] as const).map((s) => (
            <Button key={s} {...args} variant={v} size={s}>{v} {s}</Button>
          ))}
        </div>
      ))}
    </div>
  ),
};
export const AsLink: Story = {
  render: (args) => (
    <Button {...args} asChild>
      <a href="#link-example">Link styled as button</a>
    </Button>
  ),
};
