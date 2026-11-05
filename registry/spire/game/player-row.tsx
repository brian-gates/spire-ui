import { ClassBadge } from "./class-badge";
import { PotionSlots } from "./potion-slots";
import { RelicStrip } from "./relic-strip";
import { StatGold, StatHP } from "./stat";

export interface RunPlayerView {
  id: string;
  name: string;
  character: string;
  hp?: number | null;
  maxHp?: number | null;
  gold?: number | null;
  relics?: { id: string }[];
  potions?: { id: string; slot: number }[];
  maxPotionSlots?: number;
  isYou?: boolean;
}

/**
 * One player of a run: class, name, HP and gold in aligned columns, then relics and potions.
 * Renders an `li`; place it inside a `ul`. Inside a `@container` ancestor (RunRow provides one), narrow widths
 * wrap relics and potions onto their own line under the name and stats.
 */
export function PlayerRow(props: { player: RunPlayerView }) {
  const { player: p } = props;
  return (
    <li
      data-slot="player-row"
      className="grid min-h-11 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 @3xl:grid-cols-[2rem_minmax(7.5rem,11rem)_6.5rem_4.75rem_minmax(0,1fr)_auto]"
    >
      <ClassBadge character={p.character} size={32} withName={false} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span data-slot="player-name" title={p.name} className={`font-spire-display truncate font-bold ${p.isYou ? "text-spire-gold" : "text-spire-ink"}`}>
          {p.name}
        </span>
        {p.isYou && (
          <span className="shrink-0 rounded-sm border border-spire-panel-edge px-1 text-[11px] leading-4 text-spire-muted">you</span>
        )}
      </span>
      <StatHP current={p.hp ?? null} max={p.maxHp ?? null} />
      <StatGold value={p.gold ?? null} />
      <div data-slot="player-loot" className="col-span-full flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 @3xl:contents">
        <div className="min-w-0"><RelicStrip relics={p.relics ?? []} /></div>
        <PotionSlots potions={p.potions ?? []} maxSlots={p.maxPotionSlots ?? 0} />
      </div>
    </li>
  );
}
