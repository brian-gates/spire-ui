import { SpireIcon } from "../ui/spire-icon";
import { cn } from "../lib/cn";
import { HpBar } from "./hp-bar";

function Stat(props: { icon: string; label: string; text: string; known: boolean; tone: string; size?: number }) {
  return (
    <span
      data-slot="stat"
      role="img"
      aria-label={`${props.label}: ${props.known ? props.text : "unknown"}`}
      className="font-spire-display inline-flex items-center gap-1.5 tabular-nums"
    >
      <span aria-hidden className={cn("inline-flex", props.tone)}>
        <SpireIcon id={props.icon} size={props.size ?? 20} tint="currentColor" />
      </span>
      <span aria-hidden className={props.tone}>{props.text}</span>
    </span>
  );
}

const show = (n: number | null) => (n === null ? "?" : String(n));

/** Hit points as a game-style bar with "current/max" on it; an unknown side renders "?". */
export function StatHP(props: { current: number | null; max: number | null }) {
  const known = props.current !== null || props.max !== null;
  return (
    <span
      data-slot="stat"
      role="img"
      aria-label={`HP: ${known ? `${show(props.current)}/${show(props.max)}` : "unknown"}`}
      className="inline-flex h-8 w-[112px] items-end"
    >
      <span aria-hidden className="flex w-full">
        <HpBar current={props.current} max={props.max} size="md" />
      </span>
    </span>
  );
}

export function StatGold(props: { value: number | null }) {
  return <Stat icon="STAT.GOLD" label="Gold" text={show(props.value)} known={props.value !== null} tone="text-spire-gold" />;
}

export function StatEnergy(props: { value: number | null }) {
  return <Stat icon="STAT.ENERGY" label="Energy" text={show(props.value)} known={props.value !== null} tone="text-spire-energy" />;
}

/** Deck size (number of cards); null renders "?". */
export function StatDeck(props: { value: number | null }) {
  return <Stat icon="STAT.DECK" label="Deck" text={show(props.value)} known={props.value !== null} tone="text-spire-ink" />;
}
