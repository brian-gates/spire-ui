import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const tones = {
  gold: "border-spire-gold text-spire-gold bg-spire-gold/10",
  red: "border-rarity-boss text-rarity-boss bg-rarity-boss/10",
  blue: "border-spire-energy text-spire-energy bg-spire-energy/10",
} as const;

export function Banner({
  tone = "gold",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return (
    <div
      data-slot="banner"
      className={cn(
        "font-spire-display border-y-2 px-6 py-2 text-center text-lg tracking-widest uppercase",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
