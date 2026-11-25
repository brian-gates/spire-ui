import type { CSSProperties } from "react";
import { cn } from "../lib/cn";
import { useSpireAsset } from "../lib/assets-provider";
import { clampFraction } from "../lib/combat-tones";

// The game's health bar, redrawn in CSS: a slim track and fill that both end in a point, with the numbers drawn
// ON the bar. The label is bigger than the bar: its baseline sits near the bar's middle, so most of it rises
// above. The box is tall enough to hold the label with the bar at its bottom. Sizes in px: box height, track
// height, point depth, track edge, fill inset from the ends and from top/bottom, fill point, label size and
// outline, label offset from the bottom, and the block shield's height.
const SIZE = {
  md: { box: 22, track: 8, point: 3, edge: 1, blockEdge: 1.25, insetX: 3, insetY: 1.75, fillPoint: 2, text: 17, stroke: 5, lift: 0.5, shadow: "1.5px 1px", shield: 28, shieldText: 13 },
  sm: { box: 17, track: 6, point: 2.5, edge: 1, blockEdge: 1.25, insetX: 2.5, insetY: 1.5, fillPoint: 1.5, text: 12.5, stroke: 4, lift: 0, shadow: "1px 1px", shield: 22, shieldText: 11 },
} as const;

/** The fill's two tones with a thin lighter line between them: red, and steel blue while block is up. */
const twoTone = (top: string, line: string, bottom: string) =>
  `linear-gradient(to bottom, ${top} 0 calc(50% - 0.5px), ${line} calc(50% - 0.5px) calc(50% + 0.5px), ${bottom} calc(50% + 0.5px) 100%)`;
const FILL = { red: twoTone("#EE343F", "#F4676B", "#CA3136"), blue: twoTone("#3B6DA0", "#6E9CCB", "#274F73") };

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
  const shield = useSpireAsset("UI.BLOCK");
  const edge = hasBlock ? s.blockEdge : s.edge;
  // The shield is centred on the track and taller than it: room below the track when it is shown.
  const below = hasBlock && shield.source === "extracted" ? Math.max(0, (s.shield - s.track) / 2) : 0;
  return (
    <span
      data-slot="hp-bar"
      data-blocked={hasBlock ? "true" : undefined}
      {...(known
        ? { role: "meter", "aria-valuenow": current, "aria-valuemin": 0, "aria-valuemax": max, "aria-label": "HP" }
        : { role: "img", "aria-label": "HP" })}
      className={cn("block w-full", className)}
      style={{ height: s.box + below, paddingBottom: below }}
    >
      <span className="relative flex h-full w-full items-end">
      <span data-slot="hp-bar-track" aria-hidden className="relative block w-full" style={{ height: s.track, opacity: hasBlock ? 1 : 0.75 }}>
        <span className="absolute inset-0" style={{ ...pointed(s.point), background: hasBlock ? "#B4E2FF" : "rgb(23,47,36)" }} />
        <span className="absolute" style={{ inset: edge, ...pointed(Math.max(s.point - edge, 0)), background: "rgb(10,19,16)" }} />
      </span>
      <span aria-hidden className="absolute" style={{ left: s.insetX, right: s.insetX, bottom: s.insetY, height: s.track - 2 * s.insetY, ...pointed(s.fillPoint) }}>
        <span
          data-slot="hp-bar-fill"
          className="block h-full"
          style={{
            width: `${pct}%`,
            background: hasBlock ? FILL.blue : FILL.red,
          }}
        />
      </span>
      {hasBlock && shield.source === "extracted" ? (
        <span data-slot="hp-bar-block" className="font-spire-display absolute z-10 inline-flex items-center justify-center" style={{ left: -s.shield * 0.3, bottom: -below, height: s.shield, width: s.shield }}>
          <img
            alt=""
            aria-hidden
            height={s.shield}
            {...(shield.srcSet ? { srcSet: shield.srcSet, sizes: `${s.shield}px` } : {})}
            src={shield.src}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <span
            className="relative leading-none font-bold text-[#FFF6E2] tabular-nums"
            style={{ fontSize: s.shieldText, WebkitTextStroke: `${s.stroke - 1}px #0B2A4A`, paintOrder: "stroke fill" }}
          >
            {block}
          </span>
        </span>
      ) : hasBlock ? (
        <span
          data-slot="hp-bar-block"
          className="font-spire-display absolute bottom-0 z-10 inline-flex items-center justify-center rounded-full font-bold text-[#0d2b44] tabular-nums"
          style={{ left: -3, height: s.track + 4, minWidth: s.track + 4, background: "#B4E2FF", fontSize: s.text - 7, paddingInline: 2 }}
        >
          {block}
        </span>
      ) : null}
      <span
        data-slot="hp-bar-label"
        className="font-spire-display absolute inset-x-0 z-10 text-center leading-none font-bold whitespace-nowrap text-[#FFF6E2] tabular-nums"
        style={{
          bottom: s.lift,
          left: hasBlock ? s.shield * 0.35 : 0,
          fontSize: s.text,
          "--hp-outline": hasBlock ? "#0B2A4A" : "#900000",
          WebkitTextStroke: `${s.stroke}px var(--hp-outline)`,
          paintOrder: "stroke fill",
          textShadow: `${s.shadow} 0 rgba(0,0,0,0.25)`,
        } as CSSProperties}
      >
        <span aria-hidden={known ? undefined : true}>{`${show(current)}/${show(max)}`}</span>
        {!known && <span className="sr-only">unknown</span>}
      </span>
      </span>
    </span>
  );
}
