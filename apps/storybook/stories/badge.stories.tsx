import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../../../registry/spire/ui/badge";

const TONES = ["neutral", "common", "uncommon", "rare", "boss", "event", "starter"] as const;

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { tone: "rare", children: "Rare" },
  argTypes: { tone: { control: "select", options: TONES } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
    </div>
  ),
};
