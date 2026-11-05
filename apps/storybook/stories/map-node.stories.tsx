import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapNode } from "../../../registry/spire/game/map-node";

const ROOMS = ["monster", "elite", "rest", "shop", "treasure", "event", "boss", "unknown"] as const;
const STATES = ["available", "visited", "locked"] as const;

const meta = {
  title: "Game/MapNode",
  component: MapNode,
  parameters: { layout: "padded" },
  args: { room: "elite", state: "available" },
  argTypes: {
    room: { control: "select", options: ROOMS },
    state: { control: "select", options: STATES },
  },
} satisfies Meta<typeof MapNode>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllRoomsByState: Story = {
  render: () => (
    <div className="grid w-full max-w-xl grid-cols-[6rem_repeat(8,3rem)] items-center gap-3 p-3">
      <span />
      {ROOMS.map((r) => <span key={r} className="text-center text-xs text-spire-muted">{r}</span>)}
      {STATES.map((s) => (
        <div key={s} className="contents">
          <span className="text-sm text-spire-muted">{s}</span>
          {ROOMS.map((r) => <MapNode key={r} room={r} state={s} />)}
        </div>
      ))}
    </div>
  ),
};
