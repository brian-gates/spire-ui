import { SpireIcon } from "../ui/spire-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useSpireAsset } from "../lib/assets-provider";

type Potion = { id: string; slot: number };

function Filled({ id }: { id: string }) {
  const a = useSpireAsset(id);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li data-slot="potion-slot" data-filled="true" tabIndex={0} aria-label={a.name} className="spire-panel inline-flex size-10 items-center justify-center focus-visible:outline-2 focus-visible:outline-spire-gold">
          <SpireIcon id={id} size={28} />
        </li>
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-spire-display text-spire-gold">{a.name}</div>
        {a.source === "extracted" && a.description && <div className="text-spire-muted">{a.description}</div>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Fixed potion belt. Potions land in their own slot; any that cannot (slot out of range, taken, or not an integer)
 * are appended after the belt so no potion is ever dropped.
 */
export function PotionSlots(props: { potions: Potion[]; maxSlots: number }) {
  const count = Math.max(0, Math.floor(props.maxSlots));
  const belt: (Potion | null)[] = Array.from({ length: count }, () => null);
  const extras: Potion[] = [];
  for (const p of props.potions) {
    if (Number.isInteger(p.slot) && p.slot >= 0 && p.slot < count && belt[p.slot] === null) belt[p.slot] = p;
    else extras.push(p);
  }
  return (
    <ul aria-label="Potions" className="m-0 flex list-none items-center gap-1 p-0">
      {[...belt, ...extras].map((p, i) =>
        p ? (
          <Filled key={`${p.id}:${i}`} id={p.id} />
        ) : (
          <li
            key={`empty:${i}`}
            data-slot="potion-slot"
            data-filled="false"
            role="img"
            aria-label="Empty potion slot"
            className="inline-flex size-10 rounded-md border border-dashed border-spire-panel-edge opacity-60"
          />
        ),
      )}
    </ul>
  );
}
