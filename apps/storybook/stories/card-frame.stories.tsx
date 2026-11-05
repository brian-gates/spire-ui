import type { Meta, StoryObj } from "@storybook/react-vite";
import { CardFrame } from "../../../registry/spire/game/card-frame";
import { SpireIcon } from "../../../registry/spire/ui/spire-icon";

const meta = {
  title: "Game/CardFrame",
  component: CardFrame,
  parameters: { layout: "padded" },
  args: { id: "CARD.STRIKE", name: "Example Strike", cost: 1, type: "attack", rarity: "common", character: "ironclad" },
  argTypes: {
    cost: { control: "select", options: [0, 1, 2, 3, "X", null] },
    type: { control: "select", options: ["attack", "skill", "power", "status", "curse"] },
    rarity: { control: "select", options: ["starter", "common", "uncommon", "rare", "event"] },
    character: { control: "select", options: ["ironclad", "silent", "defect", "regent", "necrobinder", undefined, "modded"] },
  },
} satisfies Meta<typeof CardFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex w-full flex-wrap gap-6 p-3">{children}</div>;

export const Default: Story = {};
export const Upgraded: Story = { args: { upgraded: true } };
export const CustomArt: Story = {
  args: { id: undefined },
  render: (a) => <CardFrame {...a}><SpireIcon id="RELIC.BURNING_BLOOD" size={56} /></CardFrame>,
};

export const Types: Story = {
  render: (a) => (
    <Row>
      {(["attack", "skill", "power", "status", "curse"] as const).map((t) => (
        <CardFrame key={t} {...a} type={t} name={`A ${t}`} />
      ))}
    </Row>
  ),
};
export const Rarities: Story = {
  render: (a) => (
    <Row>
      {(["starter", "common", "uncommon", "rare", "event"] as const).map((r) => (
        <CardFrame key={r} {...a} rarity={r} name={`A ${r}`} />
      ))}
    </Row>
  ),
};
export const Characters: Story = {
  render: (a) => (
    <Row>
      {(["ironclad", "silent", "defect", "regent", "necrobinder", undefined] as const).map((c) => (
        <CardFrame key={c ?? "colorless"} {...a} character={c} name={c ?? "colorless"} />
      ))}
    </Row>
  ),
};
export const Costs: Story = {
  render: (a) => (
    <Row>
      {([0, 2, "X", null] as const).map((c) => (
        <CardFrame key={String(c)} {...a} cost={c} name={`Cost ${c === null ? "none" : c}`} />
      ))}
    </Row>
  ),
};
export const UpgradedVsBase: Story = {
  render: (a) => (
    <Row>
      <CardFrame {...a} name="Base" />
      <CardFrame {...a} name="Base" upgraded />
    </Row>
  ),
};
