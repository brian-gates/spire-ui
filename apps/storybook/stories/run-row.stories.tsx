import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RunPlayerView } from "../../../registry/spire/game/player-row";
import { RunRow, type RunView } from "../../../registry/spire/game/run-row";

const relics = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `RELIC.EXAMPLE_RELIC_${i + 1}` }));
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

const ironclad: RunPlayerView = {
  id: "a", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 52, maxHp: 80, gold: 214, deckSize: 24, characterLabel: "The Ironclad", isYou: true,
  relics: [{ id: "RELIC.BURNING_BLOOD" }, ...relics(4)], potions: [{ id: "POTION.EXAMPLE", slot: 0 }], maxPotionSlots: 3,
};
const players: RunPlayerView[] = [
  ironclad,
  { id: "b", name: "Bo", character: "CHARACTER.SILENT", hp: 61, maxHp: 70, gold: 90, deckSize: 31, characterLabel: "The Silent", relics: relics(6), potions: [], maxPotionSlots: 3 },
  { id: "c", name: "Cass", character: "CHARACTER.DEFECT", hp: 30, maxHp: 75, gold: 410, deckSize: 18, characterLabel: "The Defect", relics: relics(10), potions: [{ id: "POTION.EXAMPLE", slot: 1 }], maxPotionSlots: 3 },
  { id: "d", name: "Dev", character: "CHARACTER.REGENT", hp: 77, maxHp: 77, gold: 0, deckSize: 12, characterLabel: "The Regent", relics: relics(3), potions: [], maxPotionSlots: 2 },
];
const base: RunView = { id: "r", act: 2, floor: 21, ascension: 2, mode: "regular", savedAt: ago(3), savedBy: "Bo", players };

const meta = {
  title: "Game/RunRow",
  component: RunRow,
  args: { run: base },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="w-full max-w-5xl"><Story /></div>],
} satisfies Meta<typeof RunRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FourPlayers: Story = {};
export const ModdedUnknowns: Story = {
  args: {
    run: {
      ...base, id: "m", mode: "modded", ascension: 10,
      players: [
        { id: "a", name: "Ayla", character: "CHARACTER.MODDED_HERO", hp: 40, maxHp: 66, gold: 12, isYou: true, relics: [{ id: "RELIC.MODDED_THING" }, { id: "WEIRD" }], potions: [{ id: "POTION.MODDED_BREW", slot: 0 }], maxPotionSlots: 3 },
        { id: "b", name: "Bo", character: "CHARACTER.SILENT", relics: [{ id: "RELIC.THE_ODD_ONE" }] },
      ],
    },
  },
};
export const UnknownRunPosition: Story = {
  args: {
    run: {
      ...base, act: null, floor: null, ascension: null,
      players: [{ ...ironclad, deckSize: null, relics: undefined }, { ...players[1], relics: [] }],
    },
  },
};
export const Ended: Story = { args: { run: { ...base, ended: true, savedAt: ago(70) } } };
export const FortyRelics: Story = {
  args: { run: { ...base, players: [{ ...ironclad, relics: relics(40) }] } },
};
export const LongName: Story = {
  args: { run: { ...base, players: [{ ...ironclad, name: "Wolfeschlegelsteinhausen-Bergerd" }] } },
};

const narrow = [(Story: () => React.JSX.Element) => <div className="w-[360px]"><Story /></div>];
export const FortyRelicsNarrow: Story = { ...FortyRelics, decorators: narrow };
export const LongNameNarrow: Story = { ...LongName, decorators: narrow };
