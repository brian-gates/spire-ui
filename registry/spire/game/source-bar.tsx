import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { clampFraction, type CombatTone, formatAmount, TONE_BAR, TONE_TEXT } from "../lib/combat-tones";

/**
 * One damage source: an optional icon, the name, its amount in bold, and a thin bar underneath showing
 * `fraction` (0..1, usually the amount over the largest source shown). Renders an `li`; place it inside a
 * `ul` or `ol`. The bar is labelled for screen readers with `barLabel`, or the share it shows.
 */
export function SourceBar(props: { name: string; amount: number; fraction: number; tone?: CombatTone; icon?: ReactNode; barLabel?: string; className?: string }) {
  const { name, amount, tone = "dealt", icon, className } = props;
  const share = clampFraction(props.fraction);
  const pct = Math.round(share * 100);
  return (
    <li data-slot="source-bar" className={cn("grid min-w-0 gap-1", className)}>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {icon != null && (
          <span aria-hidden className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate" title={name}>
          {name}
        </span>
        <span className={cn("font-spire-display shrink-0 font-bold tabular-nums", TONE_TEXT[tone])}>{formatAmount(amount)}</span>
      </div>
      <div role="img" aria-label={props.barLabel ?? `${pct}% of the largest`} className="h-1.5 overflow-hidden rounded-full bg-spire-bg">
        {share > 0 && <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${share * 100}%`, minWidth: 2 }} />}
      </div>
    </li>
  );
}
