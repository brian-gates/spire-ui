import type { ReactNode } from "react";
import { PlayerRow, type RunPlayerView } from "@spire/game/player-row";
import { CardFrame } from "@spire/game/card-frame";
import { GameCard } from "@spire/game/game-card";
import { ClassBadge } from "@spire/game/class-badge";
import { MapNode } from "@spire/game/map-node";
import { PotionSlots } from "@spire/game/potion-slots";
import { RelicStrip } from "@spire/game/relic-strip";
import { RunHeader } from "@spire/game/run-header";
import { RunRow, type RunView } from "@spire/game/run-row";
import { StatEnergy, StatGold, StatHP } from "@spire/game/stat";
import { Badge } from "@spire/ui/badge";
import { Banner } from "@spire/ui/banner";
import { Button } from "@spire/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@spire/ui/dialog";
import { Divider } from "@spire/ui/divider";
import { Panel } from "@spire/ui/panel";
import { SpireIcon } from "@spire/ui/spire-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@spire/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@spire/ui/tooltip";

export interface ComponentDoc {
  /** URL slug; the registry item is `spire-<slug>`. */
  slug: string;
  name: string;
  summary: string;
  usage: string;
  Demo: () => ReactNode;
}

// Ids that exist in the curated examples, so the art preview shows real icons. Other ids fall back by design.
const REAL_RELICS = [
  "BURNING_BLOOD", "ANCHOR", "BAG_OF_MARBLES", "BLOOD_VIAL", "LANTERN", "ORICHALCUM", "KUNAI", "LETTER_OPENER",
  "ORNAMENTAL_FAN", "PEN_NIB", "PANTOGRAPH", "DOLLYS_MIRROR", "ECTOPLASM", "MANGO",
].map((n) => ({ id: `RELIC.${n}` }));
const relics = (n: number) => Array.from({ length: n }, (_, i) => REAL_RELICS[i] ?? { id: `RELIC.UNLISTED_RELIC_${i + 1}` });
const potions = [{ id: "POTION.FIRE_POTION", slot: 0 }, { id: "POTION.FAIRY_IN_A_BOTTLE", slot: 2 }];
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

const ayla: RunPlayerView = {
  id: "a", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 52, maxHp: 80, gold: 214, deckSize: 24, characterLabel: "The Ironclad", isYou: true,
  relics: relics(5), potions: [potions[0]], maxPotionSlots: 3,
};
const bo: RunPlayerView = {
  id: "b", name: "Bo", character: "CHARACTER.SILENT", hp: 61, maxHp: 70, gold: 90, deckSize: 31, characterLabel: "The Silent", relics: relics(11), potions, maxPotionSlots: 3,
};
const run: RunView = { id: "r", act: 2, floor: 21, ascension: 2, mode: "regular", savedAt: ago(3), savedBy: "Bo", players: [ayla, bo] };
const fortyRelics: RunView = { ...run, id: "40", players: [{ ...ayla, name: "Wolfeschlegelsteinhausen-Bergerd", relics: relics(40) }] };

export function RunRowDemo() {
  return <RunRow run={run} />;
}


export const COMPONENTS: ComponentDoc[] = [
  {
    slug: "icon", name: "SpireIcon", summary: "Any game object by id: the extracted icon when the manifest has it, an original fallback glyph when not.",
    usage: `<SpireIcon id="RELIC.ANCHOR" size={40} />\n<SpireIcon id="STAT.GOLD" tint="currentColor" />\n// Art drawn at a fluid CSS size: tell the browser which srcset file fits.\n<SpireIcon id="CARD.STRIKE" size={56} sizes="(max-width: 480px) 90vw, 320px" className="w-full h-auto" />`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-4">
        <SpireIcon id="RELIC.ANCHOR" size={40} />
        <SpireIcon id="POTION.FIRE_POTION" size={40} />
        <SpireIcon id="CHARACTER.SILENT" size={40} />
        <SpireIcon id="ROOM.SHOP" size={40} />
        <span className="text-spire-gold"><SpireIcon id="STAT.GOLD" size={32} tint="currentColor" /></span>
        <SpireIcon id="RELIC.NOT_IN_ANY_MANIFEST" size={40} />
      </div>
    ),
  },
  {
    slug: "panel", name: "Panel", summary: "The framed surface: default, inset and parchment variants.",
    usage: `<Panel>Default</Panel>\n<Panel variant="inset">Inset</Panel>\n<Panel variant="parchment">Parchment</Panel>`,
    Demo: () => (
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel>Default panel</Panel>
        <Panel variant="inset">Inset panel</Panel>
        <Panel variant="parchment">Parchment panel</Panel>
      </div>
    ),
  },
  {
    slug: "banner", name: "Banner", summary: "A short ribbon for an announcement, in gold, red or blue.",
    usage: `<Banner tone="gold">Victory</Banner>`,
    Demo: () => (
      <div className="grid gap-3">
        <Banner tone="gold">Victory</Banner>
        <Banner tone="red">Defeat</Banner>
        <Banner tone="blue">Rest site</Banner>
      </div>
    ),
  },
  {
    slug: "button", name: "Button", summary: "Primary, secondary and ghost buttons in three sizes. Supports asChild.",
    usage: `<Button>Continue</Button>\n<Button variant="secondary" size="sm">Back</Button>`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-3">
        <Button>Continue</Button>
        <Button variant="secondary">Back</Button>
        <Button variant="ghost">Skip</Button>
        <Button size="sm">Small</Button>
        <Button size="lg" disabled>Disabled</Button>
      </div>
    ),
  },
  {
    slug: "badge", name: "Badge", summary: "A small pill, coloured by rarity.",
    usage: `<Badge tone="rare">Rare</Badge>`,
    Demo: () => (
      <div className="flex flex-wrap gap-2">
        {(["neutral", "starter", "common", "uncommon", "rare", "boss", "event"] as const).map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
      </div>
    ),
  },
  {
    slug: "divider", name: "Divider", summary: "A themed horizontal rule.",
    usage: `<Divider />`,
    Demo: () => (<div><p>Above</p><Divider className="my-3" /><p>Below</p></div>),
  },
  {
    slug: "tooltip", name: "Tooltip", summary: "Radix tooltip in the panel style. Hover or focus the button.",
    usage: `<TooltipProvider>\n  <Tooltip>\n    <TooltipTrigger asChild><Button>Hover me</Button></TooltipTrigger>\n    <TooltipContent>Anchor: start each combat with Block.</TooltipContent>\n  </Tooltip>\n</TooltipProvider>`,
    Demo: () => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="secondary">Hover or focus me</Button></TooltipTrigger>
          <TooltipContent>A tooltip in the panel style.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    slug: "tabs", name: "Tabs", summary: "Radix tabs with a gold active state.",
    usage: `<Tabs defaultValue="relics">\n  <TabsList>\n    <TabsTrigger value="relics">Relics</TabsTrigger>\n    <TabsTrigger value="potions">Potions</TabsTrigger>\n  </TabsList>\n  <TabsContent value="relics">...</TabsContent>\n</Tabs>`,
    Demo: () => (
      <Tabs defaultValue="relics">
        <TabsList>
          <TabsTrigger value="relics">Relics</TabsTrigger>
          <TabsTrigger value="potions">Potions</TabsTrigger>
        </TabsList>
        <TabsContent value="relics"><RelicStrip relics={relics(6)} /></TabsContent>
        <TabsContent value="potions"><PotionSlots potions={potions} maxSlots={3} /></TabsContent>
      </Tabs>
    ),
  },
  {
    slug: "dialog", name: "Dialog", summary: "A modal sized to fit small screens.",
    usage: `<Dialog>\n  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>\n  <DialogContent>\n    <DialogTitle>Abandon run?</DialogTitle>\n    <DialogDescription>This cannot be undone.</DialogDescription>\n  </DialogContent>\n</Dialog>`,
    Demo: () => (
      <Dialog>
        <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
        <DialogContent>
          <DialogTitle>Abandon run?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    slug: "class-badge", name: "ClassBadge", summary: "A class emblem and name. Unknown or modded characters get a generic glyph.",
    usage: `<ClassBadge character="CHARACTER.IRONCLAD" />\n<ClassBadge character="CHARACTER.SILENT" withName={false} size={32} />`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {["IRONCLAD", "SILENT", "DEFECT", "REGENT", "NECROBINDER"].map((c) => <ClassBadge key={c} character={`CHARACTER.${c}`} />)}
        <ClassBadge character="CHARACTER.MODDED_HERO" />
      </div>
    ),
  },
  {
    slug: "stat", name: "Stats", summary: "HP, gold and energy readouts. Unknown values render a question mark.",
    usage: `<StatHP current={52} max={80} />\n<StatGold value={214} />\n<StatEnergy value={3} />`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-lg">
        <StatHP current={52} max={80} /><StatGold value={214} /><StatEnergy value={3} /><StatHP current={null} max={null} />
      </div>
    ),
  },
  {
    slug: "relic-strip", name: "RelicStrip", summary: "Relics in acquisition order; the overflow collapses into a button listing their names.",
    usage: `<RelicStrip relics={[{ id: "RELIC.ANCHOR" }, { id: "RELIC.LANTERN" }]} max={8} />`,
    Demo: () => (<div className="grid gap-4"><RelicStrip relics={relics(5)} /><RelicStrip relics={relics(20)} max={10} /><RelicStrip relics={undefined} /></div>),
  },
  {
    slug: "potion-slots", name: "PotionSlots", summary: "A fixed potion belt with empty slots. Potions that fit no slot are appended, never dropped.",
    usage: `<PotionSlots potions={[{ id: "POTION.FIRE_POTION", slot: 0 }]} maxSlots={3} />`,
    Demo: () => <PotionSlots potions={potions} maxSlots={3} />,
  },
  {
    slug: "run-header", name: "RunHeader", summary: "Act and floor, ascension, mode and when the run was saved.",
    usage: `<RunHeader run={{ act: 2, floor: 21, ascension: 2, mode: "regular", savedAt: new Date() }} />`,
    Demo: () => (
      <div className="grid gap-4">
        <RunHeader run={run} />
        <RunHeader run={{ ...run, mode: "modded", ended: true, ascension: 10 }} />
      </div>
    ),
  },
  {
    slug: "player-row", name: "PlayerRow", summary: "One player: class, name, HP, gold, deck size, relics and potions. Missing data shows as unknown, not zero.",
    usage: `<PlayerRow player={{ id: "a", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 52, maxHp: 80, deckSize: 24, characterLabel: "The Ironclad", relics }} />`,
    Demo: () => (
      <ul aria-label="Players" className="m-0 grid list-none gap-3 p-0">
        <PlayerRow player={ayla} />
        <PlayerRow player={{ id: "x", name: "Mod player", character: "CHARACTER.MODDED_HERO" }} />
      </ul>
    ),
  },
  {
    slug: "run-row", name: "RunRow", summary: "A whole run as a row. It adapts to its own width and stays inside a 360px screen even with 40 relics.",
    usage: `<RunRow run={run} actions={<Button size="sm">Open</Button>} />`,
    Demo: () => (<div className="grid gap-4"><RunRow run={fortyRelics} /><RunRow run={run} /></div>),
  },
  {
    slug: "card-frame", name: "CardFrame", summary: "An original card frame for names, costs, types and rarities. It contains no card art or text.",
    usage: `<CardFrame name="Strike" cost={1} type="attack" rarity="starter" character="CHARACTER.IRONCLAD">...</CardFrame>`,
    Demo: () => (
      <div className="flex flex-wrap gap-4">
        <CardFrame name="Strike" cost={1} type="attack" rarity="starter" character="CHARACTER.IRONCLAD" />
        <CardFrame name="Backflip" cost={1} type="skill" rarity="common" character="CHARACTER.SILENT" />
        <CardFrame name="Echo Form" cost={3} type="power" rarity="rare" character="CHARACTER.IRONCLAD" upgraded />
      </div>
    ),
  },
  {
    slug: "game-card", name: "GameCard",
    summary: "A card drawn the way the game draws it, from the frame, banner, orb and plaque pieces extract-art writes from your own game files, with the card's stats and text. Without those pieces it falls back to CardFrame, as here.",
    usage: `<GameCard id="CARD.STRIKE_IRONCLAD" upgrades={1} width={240} className="w-60" />`,
    Demo: () => (
      <div className="flex flex-wrap gap-4">
        <GameCard id="CARD.STRIKE_IRONCLAD" />
        <GameCard id="CARD.STRIKE_IRONCLAD" upgrades={1} />
      </div>
    ),
  },
  {
    slug: "map-node", name: "MapNode", summary: "A map room node in available, visited or locked state.",
    usage: `<MapNode room="elite" state="available" />`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-3">
        {(["monster", "elite", "rest", "shop", "treasure", "event", "boss", "unknown"] as const).map((r) => <MapNode key={r} room={r} />)}
        <MapNode room="monster" state="visited" />
        <MapNode room="shop" state="locked" />
      </div>
    ),
  },
];
