import { SpireIcon } from "../ui/spire-icon";
import { cn } from "../lib/cn";

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

/** Hit points as "current/max"; an unknown side renders "?". */
export function StatHP(props: { current: number | null; max: number | null }) {
  return (
    <Stat
      icon="STAT.HP"
      label="HP"
      text={`${show(props.current)}/${show(props.max)}`}
      known={props.current !== null || props.max !== null}
      tone="text-spire-hp"
    />
  );
}

export function StatGold(props: { value: number | null }) {
  return <Stat icon="STAT.GOLD" label="Gold" text={show(props.value)} known={props.value !== null} tone="text-spire-gold" />;
}

export function StatEnergy(props: { value: number | null }) {
  return <Stat icon="STAT.ENERGY" label="Energy" text={show(props.value)} known={props.value !== null} tone="text-spire-energy" />;
}
