import type { Meta, StoryObj } from "@storybook/react-vite";
import { CombatLog } from "../../../registry/spire/game/combat-log";

const plus = <span className="font-spire-display text-lg font-bold text-spire-healed">+</span>;

const meta = {
  title: "Game/CombatLog",
  component: CombatLog,
  args: {
    rounds: [
      {
        round: 1, dealt: 9, taken: 4,
        rows: [
          { key: 1, text: "Strike → Leaf Slime (M)", amount: "6", tone: "dealt", fraction: 6 / 11 },
          { key: 2, text: "Lightning → Leaf Slime (M)", amount: "3", tone: "dealt", fraction: 3 / 11 },
          { key: 3, text: "Twig Slime (S)", amount: "4", tone: "taken", fraction: 4 / 11 },
        ],
      },
      {
        round: 2, dealt: 3, taken: 15,
        rows: [
          { key: 4, text: "", icon: plus, amount: "+6", tone: "healed", fraction: 6 / 11 },
          { key: 5, text: "Lightning → Twig Slime (S)", amount: "3", tone: "dealt", fraction: 3 / 11 },
          { key: 6, text: "Twig Slime (M)", amount: "11 saved", tone: "saved", fraction: 1 },
          { key: 7, text: "Leaf Slime (M)", amount: "8", tone: "taken", fraction: 8 / 11 },
          { key: 8, text: "Leaf Slime (S)", amount: "3", tone: "taken", fraction: 3 / 11 },
          { key: 9, text: "Twig Slime (S)", amount: "4", tone: "taken", fraction: 4 / 11 },
        ],
      },
    ],
  },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-full max-w-3xl"><Story /></div>],
} satisfies Meta<typeof CombatLog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoRounds: Story = {};
export const Empty: Story = { args: { rounds: [] } };
export const Phone: Story = { decorators: [(Story) => <div className="w-[366px]"><Story /></div>] };
