import { cn } from "../lib/cn";
import { clampFraction } from "../lib/combat-tones";

const SIZE = {
  md: { bar: "h-[18px]", label: "text-[13px]", badge: "h-[18px] min-w-[18px] text-[11px]" },
  sm: { bar: "h-3.5", label: "text-[11px]", badge: "h-3.5 min-w-3.5 text-[9px]" },
} as const;

const show = (n: number | null) => (n === null ? "?" : String(n));

/**
 * A game-style health bar: a dark rounded track, a red fill sized current/max, and the numbers centred on top.
 * With `block > 0` a blue badge sits at the left end and the bar's edge turns blue. An unknown side shows "?"
 * and no fill. The bar fills its container's width; the caller sets the width.
 */
export function HpBar(props: { current: number | null; max: number | null; block?: number | null; size?: "sm" | "md"; className?: string }) {
  const { current, max, block, size = "md", className } = props;
  const known = current !== null && max !== null;
  const pct = known && max > 0 ? clampFraction(current / max) * 100 : 0;
  const hasBlock = typeof block === "number" && block > 0;
  const s = SIZE[size];
  return (
    <span
      data-slot="hp-bar"
      {...(known
        ? { role: "meter", "aria-valuenow": current, "aria-valuemin": 0, "aria-valuemax": max, "aria-label": "HP" }
        : { role: "img", "aria-label": "HP" })}
      className={cn("relative flex w-full items-center", s.bar, className)}
    >
      <span
        data-slot="hp-bar-track"
        aria-hidden
        className={cn(
          "absolute inset-0 overflow-hidden rounded-full border bg-[color-mix(in_srgb,var(--color-spire-bg)_85%,black)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.7)]",
          hasBlock ? "border-spire-saved" : "border-black/70",
        )}
      >
        <span
          data-slot="hp-bar-fill"
          className="block h-full bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-spire-hp)_75%,white),var(--color-spire-hp)_45%,color-mix(in_srgb,var(--color-spire-hp)_55%,black))]"
          style={{ width: `${pct}%` }}
        />
      </span>
      {hasBlock && (
        <span
          data-slot="hp-bar-block"
          className={cn(
            "font-spire-display relative z-10 inline-flex shrink-0 items-center justify-center rounded-full border border-black/70 bg-[color-mix(in_srgb,var(--color-spire-saved)_55%,black)] px-1 font-bold text-white tabular-nums [text-shadow:0_1px_0_#000]",
            s.badge,
          )}
        >
          {block}
        </span>
      )}
      <span
        data-slot="hp-bar-label"
        className={cn(
          "font-spire-display relative z-10 min-w-0 flex-1 truncate text-center font-bold leading-none text-white tabular-nums [text-shadow:0_0_2px_#000,0_1px_1px_#000,1px_0_0_#000,-1px_0_0_#000]",
          s.label,
        )}
      >
        <span aria-hidden={known ? undefined : true}>{`${show(current)}/${show(max)}`}</span>
        {!known && <span className="sr-only">unknown</span>}
      </span>
    </span>
  );
}
