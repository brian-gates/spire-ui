import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import { formatAmount } from "../lib/combat-tones";

export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * One combat round as a card: "Round N" in gold with "d dealt · t taken" on the right, a full-width bar
 * split by the round's dealt and taken shares, then its lines (LogRow) in an `ol`. A `@container`, so the
 * rows inside adapt to the card's own width rather than the screen's.
 */
export function RoundCard(props: {
  round: number;
  dealt: number;
  taken: number;
  children?: ReactNode;
  /** The heading level of "Round N" (default 3). */
  headingLevel?: HeadingLevel;
  /** Replaces "Round N", e.g. "Before the fight". */
  title?: ReactNode;
  className?: string;
}) {
  const { round, children, headingLevel = 3, title, className } = props;
  const dealt = Math.max(0, props.dealt);
  const taken = Math.max(0, props.taken);
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const total = dealt + taken;
  const dealtPct = total > 0 ? (dealt / total) * 100 : 0;
  const takenPct = total > 0 ? 100 - dealtPct : 0;
  return (
    <section
      data-slot="round-card"
      aria-labelledby={id}
      className={cn("@container grid min-w-0 gap-1 rounded-lg border border-spire-panel-edge bg-spire-panel px-3 py-3 text-spire-ink", className)}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
        <Heading id={id} className="font-spire-display m-0 min-w-0 flex-1 text-lg font-bold text-spire-gold">
          {title ?? `Round ${round}`}
        </Heading>
        <span className="font-spire-display text-sm tabular-nums">
          <span className="text-spire-dealt">{formatAmount(dealt)} dealt</span>
          <span aria-hidden className="px-1.5 text-spire-muted">·</span>
          <span className="text-spire-taken">{formatAmount(taken)} taken</span>
        </span>
      </div>
      <div
        data-slot="round-split"
        role="img"
        aria-label={total > 0 ? `Dealt ${Math.round(dealtPct)}%, taken ${Math.round(takenPct)}%` : "No damage"}
        className="mb-1.5 flex h-2 overflow-hidden rounded-full bg-spire-bg"
      >
        {dealt > 0 && <div className="h-full bg-spire-dealt" style={{ width: `${dealtPct}%` }} />}
        {taken > 0 && <div className="h-full bg-spire-taken" style={{ width: `${takenPct}%` }} />}
      </div>
      {children != null && <ol className="m-0 grid min-w-0 list-none p-0">{children}</ol>}
    </section>
  );
}
