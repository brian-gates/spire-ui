import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { type CombatTone, formatAmount, TONE_TEXT, TONE_TILE } from "../lib/combat-tones";

/**
 * One combat total as a tinted tile: a small muted label over a big number in the tone's colour.
 * Renders a `dt`/`dd` pair; place tiles inside `StatTiles` (a `dl`). null shows "?" (read as "unknown").
 */
export function StatTile(props: { label: string; value: number | null; tone?: CombatTone; title?: string; className?: string }) {
  const { label, value, tone = "neutral", title, className } = props;
  return (
    <div data-slot="stat-tile" title={title} className={cn("grid min-w-0 content-center gap-0.5 rounded-md px-2 py-2.5 text-center", TONE_TILE[tone], className)}>
      <dt className="text-sm text-spire-muted">{label}</dt>
      <dd className={cn("font-spire-display m-0 truncate text-3xl/tight font-bold tabular-nums", TONE_TEXT[tone])}>
        {value === null ? (
          <>
            <span aria-hidden>?</span>
            <span className="sr-only">unknown</span>
          </>
        ) : (
          formatAmount(value)
        )}
      </dd>
    </div>
  );
}

/** The tiles' list: a `dl` laid out two to a row. `label` names it for screen readers. */
export function StatTiles(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <dl data-slot="stat-tiles" aria-label={props.label} className={cn("m-0 grid grid-cols-2 gap-2.5", props.className)}>
      {props.children}
    </dl>
  );
}
