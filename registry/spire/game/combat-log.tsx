import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import type { CombatTone } from "../lib/combat-tones";
import { LogRow } from "./log-row";
import { type HeadingLevel, RoundCard } from "./round-card";

export interface CombatLogRow {
  key: string | number;
  text: ReactNode;
  amount?: ReactNode;
  tone?: CombatTone;
  fraction?: number;
  icon?: ReactNode;
  accent?: string;
  barLabel?: string;
}

export interface CombatLogRound {
  round: number;
  dealt: number;
  taken: number;
  rows: CombatLogRow[];
}

/**
 * A whole combat log: a heading, then one RoundCard per round with its LogRows. For anything between the
 * heading and the cards, compose RoundCard and LogRow yourself.
 */
export function CombatLog(props: { rounds: CombatLogRound[]; title?: ReactNode; headingLevel?: Exclude<HeadingLevel, 6>; empty?: ReactNode; className?: string }) {
  const { rounds, title = "Combat log", headingLevel = 2, empty = "No hits recorded.", className } = props;
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  const inner = (headingLevel + 1) as HeadingLevel;
  return (
    <section data-slot="combat-log" aria-labelledby={id} className={cn("grid min-w-0 gap-3.5", className)}>
      <Heading id={id} className="font-spire-display m-0 text-xl font-bold text-spire-gold">
        {title}
      </Heading>
      {rounds.length === 0 ? (
        <p className="m-0 text-sm text-spire-muted">{empty}</p>
      ) : (
        rounds.map((r) => (
          <RoundCard key={r.round} round={r.round} dealt={r.dealt} taken={r.taken} headingLevel={inner}>
            {r.rows.map(({ key, text, ...row }) => (
              <LogRow key={key} {...row}>
                {text}
              </LogRow>
            ))}
          </RoundCard>
        ))
      )}
    </section>
  );
}
