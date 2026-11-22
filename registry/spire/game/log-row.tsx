import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { clampFraction, type CombatTone, TONE_AMOUNT, TONE_BAR } from "../lib/combat-tones";

/**
 * One combat log line as a table row: icon | text | amount (bold, right-aligned) | bar, the bar in its own
 * column so it never sits behind the text. `fraction` (0..1) is the amount over the largest single amount
 * the log scales to; with no amount (a potion line) the bar cell stays empty. `accent` (any CSS colour or
 * gradient) adds a thin stripe before the icon, e.g. the player's colour in co-op.
 * Renders an `li`; place it inside RoundCard (or another `ol`/`ul`). Narrow containers get a narrower
 * bar column; a `@container` ancestor (RoundCard is one) sets the width it adapts to.
 */
export function LogRow(props: {
  children?: ReactNode;
  amount?: ReactNode;
  tone?: CombatTone;
  fraction?: number;
  icon?: ReactNode;
  accent?: string;
  /** The bar's screen reader label; defaults to the share it shows. */
  barLabel?: string;
  className?: string;
}) {
  const { children, amount, tone = "neutral", icon, accent, className } = props;
  const share = clampFraction(props.fraction ?? 0);
  const hasBar = amount != null && share > 0;
  return (
    <li
      data-slot="log-row"
      className={cn(
        "grid min-h-9 min-w-0 grid-cols-[1.875rem_minmax(0,1fr)_auto_3.5rem] items-center gap-x-2 border-t border-spire-panel-edge/50 py-1 text-sm",
        "@lg:grid-cols-[1.875rem_minmax(0,1fr)_5.5rem_minmax(6rem,15rem)] @lg:gap-x-3.5 @lg:text-base",
        className,
      )}
    >
      <span aria-hidden className="relative inline-flex h-full min-h-6 items-center justify-center">
        {accent && <span data-slot="log-row-accent" className="absolute top-1 bottom-1 -left-2 w-1 rounded-full" style={{ background: accent }} />}
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
      <span className={cn("font-spire-display text-right font-bold whitespace-nowrap tabular-nums", TONE_AMOUNT[tone])}>{amount}</span>
      {hasBar ? (
        <span role="img" aria-label={props.barLabel ?? `${Math.round(share * 100)}% of the largest`} className="block h-2.5 overflow-hidden rounded-full bg-spire-bg @lg:h-3">
          <span className={cn("block h-full rounded-full", TONE_BAR[tone])} style={{ width: `${share * 100}%`, minWidth: 2 }} />
        </span>
      ) : (
        <span aria-hidden />
      )}
    </li>
  );
}
