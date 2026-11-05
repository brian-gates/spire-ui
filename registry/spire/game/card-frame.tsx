import type { ReactNode } from "react";
import { FallbackIcon } from "../icons/fallback";
import { SpireIcon } from "../ui/spire-icon";
import { cn } from "../lib/cn";

type CardType = "attack" | "skill" | "power" | "status" | "curse";
type Rarity = "starter" | "common" | "uncommon" | "rare" | "event";

// Literal class names so Tailwind's scanner emits every one of them.
const FRAME = {
  ironclad: "border-class-ironclad",
  silent: "border-class-silent",
  defect: "border-class-defect",
  regent: "border-class-regent",
  necrobinder: "border-class-necrobinder",
  colorless: "border-class-colorless",
} as const;

const BANNER: Record<Rarity, string> = {
  starter: "border-rarity-starter",
  common: "border-rarity-common",
  uncommon: "border-rarity-uncommon",
  rare: "border-rarity-rare",
  event: "border-rarity-event",
};

const TYPE_LABEL: Record<CardType, string> = { attack: "Attack", skill: "Skill", power: "Power", status: "Status", curse: "Curse" };
const RARITY_LABEL: Record<Rarity, string> = { starter: "Starter", common: "Common", uncommon: "Uncommon", rare: "Rare", event: "Event" };

/** Accepts "ironclad" or "CHARACTER.IRONCLAD"; anything else is colorless. */
function frameKey(character: string | undefined): keyof typeof FRAME {
  const k = (character ?? "").replace(/^CHARACTER\./i, "").toLowerCase();
  return k !== "colorless" && k in FRAME ? (k as keyof typeof FRAME) : "colorless";
}

/** Original card frame. Put art in `children`; with only an `id` it shows that id's icon or the generic card glyph. */
export function CardFrame(props: {
  id?: string;
  name: string;
  cost: number | "X" | null;
  type: CardType;
  rarity: Rarity;
  character?: string;
  upgraded?: boolean;
  children?: ReactNode;
}) {
  const { id, name, cost, type, rarity, character, upgraded, children } = props;
  const shownName = upgraded ? `${name}+` : name;
  const label = [shownName, TYPE_LABEL[type], RARITY_LABEL[rarity], cost === null ? null : `cost ${cost}`].filter(Boolean).join(", ");
  return (
    <div
      data-slot="card-frame"
      role="group"
      aria-label={label}
      className={cn(
        "relative flex w-44 flex-col gap-2 rounded-xl border-4 bg-spire-panel p-2 pt-4 text-spire-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)]",
        FRAME[frameKey(character)],
      )}
    >
      {cost !== null && (
        <span
          data-slot="card-cost"
          aria-label={`Cost ${cost}`}
          role="img"
          className="font-spire-display absolute -left-3 -top-3 flex size-9 items-center justify-center rounded-full border-2 border-spire-bg bg-spire-energy text-lg font-bold leading-none text-spire-bg"
        >
          <span aria-hidden>{cost}</span>
        </span>
      )}
      <div
        data-slot="card-banner"
        className={cn("font-spire-display rounded-md border-2 bg-spire-bg px-2 py-0.5 text-center text-sm", BANNER[rarity])}
      >
        <span data-slot="card-name" className={upgraded ? "text-class-silent" : undefined}>{shownName}</span>
      </div>
      <div
        data-slot="card-art"
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-spire-panel-edge bg-spire-bg text-5xl text-spire-muted"
      >
        {children ?? (id ? <SpireIcon id={id} size={56} /> : <FallbackIcon k="card" title="Card" className="size-14" />)}
      </div>
      <div data-slot="card-type" className="font-spire-display text-center text-xs uppercase tracking-wider text-spire-muted">
        {TYPE_LABEL[type]}
      </div>
    </div>
  );
}
