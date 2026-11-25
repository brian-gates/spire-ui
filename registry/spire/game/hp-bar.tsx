import type { CSSProperties } from "react";
import { cn } from "../lib/cn";
import { clampFraction } from "../lib/combat-tones";

// The game's health bar, redrawn in CSS: track and fill both end in a point (a stretched hexagon). Geometry per
// size, in px: bar height, depth of each end's point, the track's edge, the fill's inset from the ends and from
// the top and bottom, and the label's size and outline.
const SIZE = {
  md: { h: 16, point: 7, edge: 1.5, blockEdge: 2, insetX: 5, insetY: 3, fillPoint: 4, text: 14, stroke: 4, shadow: "1.5px 1px" },
  sm: { h: 13, point: 5.5, edge: 1.25, blockEdge: 1.75, insetX: 4, insetY: 2.5, fillPoint: 3, text: 11, stroke: 3, shadow: "1px 1px" },
} as const;

/** A shape with its left and right ends pointed `d` px deep, the point in the vertical middle. */
const pointed = (d: number): CSSProperties => ({
  clipPath: `polygon(0 50%, ${d}px 0, calc(100% - ${d}px) 0, 100% 50%, calc(100% - ${d}px) 100%, ${d}px 100%)`,
});

const show = (n: number | null) => (n === null ? "?" : String(n));

/**
 * A game-style health bar: a dark teal pointed track, a red pointed fill sized current/max, and the numbers
 * centred on top. With `block > 0` a light-blue badge sits at the left end and the track gets a light-blue
 * outline. An unknown side shows "?" and no fill. The bar fills its container's width; the caller sets the width.
 */
export function HpBar(props: { current: number | null; max: number | null; block?: number | null; size?: "sm" | "md"; className?: string }) {
  const { current, max, block, size = "md", className } = props;
  const known = current !== null && max !== null;
  const pct = known && max > 0 ? clampFraction(current / max) * 100 : 0;
  const hasBlock = typeof block === "number" && block > 0;
  const s = SIZE[size];
  const edge = hasBlock ? s.blockEdge : s.edge;
  return (
    <span
      data-slot="hp-bar"
      {...(known
        ? { role: "meter", "aria-valuenow": current, "aria-valuemin": 0, "aria-valuemax": max, "aria-label": "HP" }
        : { role: "img", "aria-label": "HP" })}
      className={cn("relative flex w-full items-center", className)}
      style={{ height: s.h }}
    >
      <span data-slot="hp-bar-track" aria-hidden className="absolute inset-0" style={{ opacity: hasBlock ? 1 : 0.75 }}>
        <span className="absolute inset-0" style={{ ...pointed(s.point), background: hasBlock ? "#B4E2FF" : "rgb(23,47,36)" }} />
        <span className="absolute" style={{ inset: edge, ...pointed(Math.max(s.point - edge, 0)), background: "rgb(10,19,16)" }} />
      </span>
      <span aria-hidden className="absolute" style={{ inset: `${s.insetY}px ${s.insetX}px`, ...pointed(s.fillPoint) }}>
        <span
          data-slot="hp-bar-fill"
          className="block h-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(to bottom, #CC0C0C 0 calc(50% - 0.5px), #E04A3A calc(50% - 0.5px) calc(50% + 0.5px), #8C0808 calc(50% + 0.5px) 100%)",
          }}
        />
      </span>
      {hasBlock && (
        <span
          data-slot="hp-bar-block"
          className="font-spire-display relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#0d2b44] tabular-nums"
          style={{ height: s.h, minWidth: s.h, background: "#B4E2FF", fontSize: s.text - 3, paddingInline: 3 }}
        >
          {block}
        </span>
      )}
      <span
        data-slot="hp-bar-label"
        className="font-spire-display relative z-10 min-w-0 flex-1 text-center leading-none font-bold whitespace-nowrap text-[#FFF6E2] tabular-nums"
        style={{
          fontSize: s.text,
          WebkitTextStroke: `${s.stroke}px #900000`,
          paintOrder: "stroke fill",
          textShadow: `${s.shadow} 0 rgba(0,0,0,0.25)`,
        }}
      >
        <span aria-hidden={known ? undefined : true}>{`${show(current)}/${show(max)}`}</span>
        {!known && <span className="sr-only">unknown</span>}
      </span>
    </span>
  );
}
