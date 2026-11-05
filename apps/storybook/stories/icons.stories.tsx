import type { Meta, StoryObj } from "@storybook/react-vite";
import { FallbackIcon } from "../../../registry/spire/icons/fallback";
import type { FallbackKey } from "../../../registry/spire/icons/fallback-keys";
import { SpireIcon } from "../../../registry/spire/ui/spire-icon";

const KEYS: FallbackKey[] = [
  "relic", "potion", "card",
  "class.ironclad", "class.silent", "class.defect", "class.regent", "class.necrobinder", "class.unknown",
  "room.monster", "room.elite", "room.rest", "room.shop", "room.treasure", "room.event", "room.boss", "room.unknown",
  "stat.hp", "stat.gold", "stat.energy",
];

function FallbackGrid() {
  return (
    <div className="grid grid-cols-4 gap-4 p-6 sm:grid-cols-5">
      {KEYS.map((k) => (
        <div key={k} className="spire-panel flex flex-col items-center gap-2 p-3">
          <span className="inline-block text-5xl leading-none text-spire-gold" style={{ width: 48, height: 48, lineHeight: 0 }}>
            <FallbackIcon k={k} title={k} />
          </span>
          <code className="text-xs text-spire-muted">{k}</code>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Foundations/Fallback icons",
  component: SpireIcon,
  parameters: { layout: "fullscreen" },
  args: { id: "RELIC.BURNING_BLOOD", size: 64 },
  argTypes: {
    id: {
      control: "select",
      options: [
        "RELIC.BURNING_BLOOD", "POTION.FIRE_POTION", "CARD.STRIKE", "CHARACTER.SILENT", "CHARACTER.MODDED_HERO",
        "ROOM.ELITE", "ROOM.UNKNOWN_ROOM", "STAT.GOLD", "UNKNOWN", "MODDED.SOMETHING_NEW",
      ],
    },
    size: { control: { type: "range", min: 16, max: 160, step: 8 } },
    tint: { control: "color" },
  },
} satisfies Meta<typeof SpireIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllFallbackKeys: Story = { render: () => <FallbackGrid /> };
export const Icon: Story = {};
export const UnknownId: Story = { args: { id: "MODDED.SOMETHING_NEW" } };
