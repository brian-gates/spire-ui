import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Panel } from "../ui/panel";
import { PlayerRow, type RunPlayerView } from "./player-row";
import { RunHeader } from "./run-header";

export type { RunPlayerView };

export interface RunView {
  id: string;
  /** null when the save does not record it; rendered as "?". */
  act: number | null;
  floor: number | null;
  ascension: number | null;
  mode: "regular" | "modded";
  ended?: boolean;
  savedAt?: Date;
  savedBy?: string;
  players: RunPlayerView[];
}

/** One run as a full-width row: header, then a line per player. Responds to its own width, not the viewport. */
export function RunRow(props: { run: RunView; actions?: ReactNode }) {
  const { run, actions } = props;
  return (
    <article data-slot="run-row" data-ended={run.ended ? "true" : undefined} className="@container w-full min-w-0">
      <Panel className={cn("grid gap-3 p-3", run.ended && "opacity-80")}>
        <RunHeader run={run} actions={actions} />
        <ul aria-label="Players" className="m-0 grid list-none gap-3 border-t border-spire-panel-edge/60 p-0 pt-3">
          {run.players.map((p) => <PlayerRow key={p.id} player={p} />)}
        </ul>
      </Panel>
    </article>
  );
}
