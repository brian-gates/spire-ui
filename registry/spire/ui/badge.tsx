import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const tones = {
  neutral: "text-spire-muted border-spire-panel-edge",
  common: "text-rarity-common border-rarity-common",
  uncommon: "text-rarity-uncommon border-rarity-uncommon",
  rare: "text-rarity-rare border-rarity-rare",
  boss: "text-rarity-boss border-rarity-boss",
  event: "text-rarity-event border-rarity-event",
  starter: "text-rarity-starter border-rarity-starter",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "font-spire-display inline-flex items-center rounded-full border bg-spire-bg/50 px-2 py-0.5 text-xs tracking-wide uppercase",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
