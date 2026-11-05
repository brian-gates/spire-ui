import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClassBadge } from "../../../registry/spire/game/class-badge";

const classes = ["IRONCLAD", "SILENT", "DEFECT", "REGENT", "NECROBINDER"].map((c) => `CHARACTER.${c}`);

const meta = {
  title: "Game/ClassBadge",
  component: ClassBadge,
  args: { character: "CHARACTER.IRONCLAD", size: 24, withName: true },
  argTypes: { character: { control: "select", options: [...classes, "CHARACTER.MODDED"] }, size: { control: { type: "range", min: 16, max: 96 } } },
} satisfies Meta<typeof ClassBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const AllClasses: Story = {
  render: (args) => <div className="flex flex-col gap-3">{classes.map((c) => <ClassBadge key={c} {...args} character={c} />)}</div>,
};
export const IconOnly: Story = { args: { withName: false, size: 48 } };
export const UnknownModded: Story = { args: { character: "CHARACTER.MODDED" } };
