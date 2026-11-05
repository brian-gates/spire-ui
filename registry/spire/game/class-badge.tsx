import { SpireIcon } from "../ui/spire-icon";
import { cn } from "../lib/cn";
import { useSpireAsset } from "../lib/assets-provider";

/** Class emblem plus name. Unknown or modded characters get the unknown-class glyph and a tidied name. */
export function ClassBadge(props: { character: string; size?: number; withName?: boolean }) {
  const { character, size = 24, withName = true } = props;
  const asset = useSpireAsset(character);
  return (
    <span
      data-slot="class-badge"
      className={cn("inline-flex items-center gap-2")}
      {...(withName ? {} : { role: "img", "aria-label": asset.name })}
    >
      <span aria-hidden={withName ? true : undefined} className="inline-flex">
        <SpireIcon id={character} size={size} />
      </span>
      {withName && <span data-slot="class-badge-name" className="font-spire-display text-spire-ink">{asset.name}</span>}
    </span>
  );
}
