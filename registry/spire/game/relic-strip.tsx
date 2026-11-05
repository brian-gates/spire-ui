import { useState } from "react";
import { SpireIcon } from "../ui/spire-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useSpireAsset } from "../lib/assets-provider";

function RelicTip({ id }: { id: string }) {
  const a = useSpireAsset(id);
  return (
    <>
      <div className="font-spire-display text-spire-gold">{a.name}</div>
      {a.source === "extracted" && a.description && <div className="text-spire-muted">{a.description}</div>}
    </>
  );
}

function RelicName({ id }: { id: string }) {
  return <li>{useSpireAsset(id).name}</li>;
}

function Relic({ id }: { id: string }) {
  const a = useSpireAsset(id);
  return (
    <Tooltip>
      <li data-slot="relic" className="inline-flex">
        <TooltipTrigger
          type="button"
          aria-label={a.name}
          className="inline-flex cursor-default appearance-none rounded-sm border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-spire-gold"
        >
          <SpireIcon id={id} size={32} />
        </TooltipTrigger>
      </li>
      <TooltipContent><RelicTip id={id} /></TooltipContent>
    </Tooltip>
  );
}

function Overflow({ hidden }: { hidden: { id: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="inline-flex">
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`+${hidden.length} more relics`}
          className="font-spire-display rounded-full border border-spire-panel-edge bg-transparent px-2 text-sm text-spire-muted focus-visible:outline-2 focus-visible:outline-spire-gold"
        >
          +{hidden.length}
        </TooltipTrigger>
        <TooltipContent className="max-h-64 overflow-auto">
          <ul className="list-none">
            {hidden.map((r, i) => <RelicName key={`${r.id}:${i}`} id={r.id} />)}
          </ul>
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

/** Relics in acquisition order; beyond `max` (default 8) the rest collapse into a "+N" button listing their names. */
export function RelicStrip(props: { relics: { id: string }[]; max?: number }) {
  const { relics, max = 8 } = props;
  if (relics.length === 0) return <span className="text-sm text-spire-muted">No relics</span>;
  const limit = Math.max(0, Math.floor(max));
  const shown = relics.slice(0, limit);
  const hidden = relics.slice(limit);
  return (
    <ul aria-label="Relics" className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
      {shown.map((r, i) => <Relic key={`${r.id}:${i}`} id={r.id} />)}
      {hidden.length > 0 && <Overflow hidden={hidden} />}
    </ul>
  );
}
