import { FallbackIcon, type FallbackKey } from "../icons/fallback";
import { cn } from "../lib/cn";

type Room = "monster" | "elite" | "rest" | "shop" | "treasure" | "event" | "boss" | "unknown";
type State = "available" | "visited" | "locked";

const LABEL: Record<Room, string> = {
  monster: "Monster", elite: "Elite", rest: "Rest", shop: "Shop", treasure: "Treasure", event: "Event", boss: "Boss", unknown: "Unknown",
};

// Locked uses a literal mid-tone so the glyph stays >= 3:1 against both the node and page backgrounds.
const STATE: Record<State, string> = {
  available: "border-spire-gold bg-spire-panel text-spire-gold shadow-[0_0_10px_rgb(240_199_94/0.45)]",
  visited: "border-spire-panel-edge bg-spire-bg text-spire-muted",
  locked: "border-dashed border-spire-panel-edge bg-spire-panel text-[#6f858c]",
};

/** One node on the run map. Its accessible name is "<Room> (<state>)". */
export function MapNode(props: { room: Room; state?: State }) {
  const { room, state = "available" } = props;
  const label = `${LABEL[room]} (${state})`;
  return (
    <span
      data-slot="map-node"
      data-state={state}
      role="img"
      aria-label={label}
      className={cn("relative inline-flex size-12 items-center justify-center rounded-full border-2 text-2xl", STATE[state])}
    >
      <span aria-hidden className={cn("inline-flex", state === "visited" && "opacity-70")}>
        <FallbackIcon k={`room.${room}` as FallbackKey} title={label} />
      </span>
      {state === "visited" && (
        <svg aria-hidden viewBox="0 0 24 24" className="absolute -bottom-1 -right-1 size-4 rounded-full bg-spire-bg text-class-silent" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m6 12.5 4 4 8-9" />
        </svg>
      )}
    </span>
  );
}
