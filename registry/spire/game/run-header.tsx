import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { SpireIcon } from "../ui/spire-icon";

export interface RunHeaderView {
  act: number | null;
  floor: number | null;
  ascension: number | null;
  mode: "regular" | "modded";
  ended?: boolean;
  savedAt?: Date;
  savedBy?: string;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3_600], ["minute", 60],
];

/** "3 hours ago" style text; falls back to "just now" under a minute. */
function relativeTime(date: Date, now = Date.now()): string {
  const secs = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(secs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of UNITS) if (abs >= size) return rtf.format(Math.round(secs / size), unit);
  return rtf.format(0, "second");
}

/** A value that may be unknown: shows "?" visually and "<label> unknown" to assistive tech. */
function Maybe(props: { label: string; value: number | null; className?: string; text: (v: string) => string }) {
  const { label, value, className, text } = props;
  if (value !== null) return <span className={className}>{text(String(value))}</span>;
  return (
    <>
      <span aria-hidden className={className}>{text("?")}</span>
      <span className="sr-only">{label} unknown</span>
    </>
  );
}

/** Run summary line: act and floor, ascension, mode and ended badges, and when/by whom it was saved. */
export function RunHeader(props: { run: RunHeaderView; actions?: ReactNode }) {
  const { run, actions } = props;
  return (
    <div data-slot="run-header" className="font-spire-display flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="flex items-baseline gap-2">
        <Maybe label="Act" value={run.act} className="text-spire-muted" text={(v) => `Act ${v}`} />
        <Maybe label="Floor" value={run.floor} className="text-xl font-bold" text={(v) => `Floor ${v}`} />
      </span>
      <span className="inline-flex items-center gap-1 text-spire-gold">
        <span aria-hidden className="inline-flex"><SpireIcon id="STAT.ASCENSION" size={20} tint="currentColor" /></span>
        {run.ascension === null ? (
          <>
            <span aria-hidden className="font-bold">A?</span>
            <span className="sr-only">Ascension unknown</span>
          </>
        ) : (
          <>
            <span aria-hidden className="font-bold">A{run.ascension}</span>
            <span className="sr-only">Ascension {run.ascension}</span>
          </>
        )}
      </span>
      {run.mode === "modded" && <Badge tone="event">Modded</Badge>}
      {run.ended && <Badge tone="boss">Ended</Badge>}
      {run.savedAt && (
        <span className="text-sm text-spire-muted @2xl:ml-auto" title={run.savedAt.toLocaleString()}>
          Saved {relativeTime(run.savedAt)}
          {run.savedBy ? ` by ${run.savedBy}` : ""}
        </span>
      )}
      {actions}
    </div>
  );
}
