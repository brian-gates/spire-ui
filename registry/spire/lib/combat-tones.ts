// Shared by the combat stats components (StatTile, SourceBar, RoundCard, LogRow): one colour per kind of
// combat number, from the theme's --color-spire-dealt/-taken/-saved/-healed tokens. Every class is written
// out in full so Tailwind finds it.

/** What a combat number is: damage dealt, damage taken, HP a Buffer saved, HP healed, or anything else. */
export type CombatTone = "dealt" | "taken" | "saved" | "healed" | "neutral";

/** Text in the tone's colour, for totals and source amounts. */
export const TONE_TEXT: Record<CombatTone, string> = {
  dealt: "text-spire-dealt",
  taken: "text-spire-taken",
  saved: "text-spire-saved",
  healed: "text-spire-healed",
  neutral: "text-spire-ink",
};

/** A log line's amount: dealt damage stays cream (its bar carries the colour), the rest take their tone. */
export const TONE_AMOUNT: Record<CombatTone, string> = { ...TONE_TEXT, dealt: "text-spire-ink" };

/** A bar's fill. */
export const TONE_BAR: Record<CombatTone, string> = {
  dealt: "bg-spire-dealt",
  taken: "bg-spire-taken",
  saved: "bg-spire-saved",
  healed: "bg-spire-healed",
  neutral: "bg-spire-muted",
};

/** A tile's background: the tone mixed into the page background, dark enough for the tone's text at 4.5:1. */
export const TONE_TILE: Record<CombatTone, string> = {
  dealt: "bg-[color-mix(in_srgb,var(--color-spire-dealt)_16%,var(--color-spire-bg))]",
  taken: "bg-[color-mix(in_srgb,var(--color-spire-taken)_16%,var(--color-spire-bg))]",
  saved: "bg-[color-mix(in_srgb,var(--color-spire-saved)_16%,var(--color-spire-bg))]",
  healed: "bg-[color-mix(in_srgb,var(--color-spire-healed)_16%,var(--color-spire-bg))]",
  neutral: "bg-spire-bg/60",
};

/** A bar's share clamped to 0..1; anything that is not a finite number is 0. */
export function clampFraction(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

const fmt = new Intl.NumberFormat("en-US");

/** A whole number with thousands separators ("1,204"). */
export const formatAmount = (v: number): string => fmt.format(v);
