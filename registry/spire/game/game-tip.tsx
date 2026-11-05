import type { CSSProperties, ReactNode } from "react";
import { resolveAsset, type CardTextRun, type ItemStats, type NineSlice } from "../lib/assets";
import { useSpireAsset, useSpireManifest } from "../lib/assets-provider";
import { cn } from "../lib/cn";

/**
 * The game's hover tip (scenes/ui/hover_tip.tscn), in its pixels: the panel's nine-slice borders,
 * the text's inset from the panel's edges, the description's wrap width, the font size and the
 * drop shadow (the same panel drawn 8px right and down in 25% black). The manifest's
 * `UI.HOVER_TIP` `slice` wins when present.
 */
export const GAME_TIP_LAYOUT = {
  slice: { left: 55, top: 43, right: 72, bottom: 21 } satisfies NineSlice,
  padding: { left: 22, top: 16, right: 26, bottom: 17 },
  textWidth: 300,
  fontSize: 22,
  shadow: 8,
} as const;

/** The game's text colours (StsColors): the title is gold, the description cream with gold/blue/purple tags. */
export const GAME_TIP_COLOURS = { title: "#efc851", text: "#fff6e2", gold: "#efc851", blue: "#87ceeb", purple: "#ee82ee", green: "#7fff00", red: "#ff5555" } as const;

const RUN_COLOURS: Record<NonNullable<CardTextRun["style"]>, string> = {
  number: GAME_TIP_COLOURS.text,
  upgraded: "#7fff5e",
  gold: GAME_TIP_COLOURS.gold,
  blue: GAME_TIP_COLOURS.blue,
  purple: GAME_TIP_COLOURS.purple,
};

/** Rarity -> label colour, as the game's relic inspect screen colours its rarity label. */
export const RARITY_COLOURS: Record<string, string> = {
  None: GAME_TIP_COLOURS.text,
  Starter: GAME_TIP_COLOURS.text,
  Common: GAME_TIP_COLOURS.text,
  Token: GAME_TIP_COLOURS.text,
  Uncommon: GAME_TIP_COLOURS.blue,
  Rare: GAME_TIP_COLOURS.gold,
  Shop: GAME_TIP_COLOURS.blue,
  Event: GAME_TIP_COLOURS.green,
  Ancient: GAME_TIP_COLOURS.red,
};

/** Default size: the game's 22px text at 0.7, about 15px. */
const DEFAULT_SCALE = 0.7;

/**
 * A hover tip drawn the way the game draws one: its panel texture (`UI.HOVER_TIP`, stretched by its
 * nine-slice) with the drop shadow, the title in gold and the description in cream with the game's
 * coloured keywords and numbers. Without the extracted panel it uses the kit's own panel.
 *
 * `rarity` adds a line under the title (the game's hover tip has none; the colour is the one its
 * inspect screen gives that rarity). `icon` goes after the title, where the game puts a power's icon.
 * `scale` sizes the whole tip from the game's pixels (default 0.7).
 */
export function GameTip(props: {
  title?: string;
  /** The description as styled runs (wins over `description`). */
  runs?: CardTextRun[];
  description?: string;
  rarity?: { label: string; colour?: string };
  icon?: ReactNode;
  scale?: number;
  className?: string;
}) {
  const { title, runs, description, rarity, icon, scale = DEFAULT_SCALE, className } = props;
  const { base, manifest } = useSpireManifest();
  const panel = resolveAsset("UI.HOVER_TIP", manifest, base);
  const game = panel.source === "extracted";
  const slice = (game && panel.slice) || GAME_TIP_LAYOUT.slice;
  const L = GAME_TIP_LAYOUT;
  const px = (n: number) => `${+(n * scale).toFixed(2)}px`;
  const text = runs ?? (description ? [{ text: description }] : []);

  const frame: CSSProperties | undefined = game
    ? {
        borderStyle: "solid",
        borderWidth: `${px(slice.top)} ${px(slice.right)} ${px(slice.bottom)} ${px(slice.left)}`,
        borderImage: `url("${panel.src}") ${slice.top} ${slice.right} ${slice.bottom} ${slice.left} fill / ${px(slice.top)} ${px(slice.right)} ${px(slice.bottom)} ${px(slice.left)}`,
        filter: `drop-shadow(${px(L.shadow)} ${px(L.shadow)} 0 rgb(0 0 0 / 0.25))`,
      }
    : undefined;

  return (
    <div
      data-slot="game-tip"
      data-variant={game ? "game" : "fallback"}
      className={cn("font-spire-display relative box-border text-left", className)}
      style={{
        width: px(L.padding.left + L.textWidth + L.padding.right),
        maxWidth: "calc(100vw - 16px)",
        // Room for the shadow, which the game draws past the panel.
        marginRight: game ? px(L.shadow) : undefined,
        marginBottom: game ? px(L.shadow) : undefined,
      }}
    >
      <div aria-hidden data-slot="game-tip-panel" data-slice={game ? `${slice.top} ${slice.right} ${slice.bottom} ${slice.left}` : undefined} className={cn("pointer-events-none absolute inset-0 box-border", !game && "spire-panel")} style={frame} />
      <div
        className="relative"
        style={{
          padding: `${px(L.padding.top)} ${px(L.padding.right)} ${px(L.padding.bottom)} ${px(L.padding.left)}`,
          fontSize: px(L.fontSize),
          textShadow: `${px(3)} ${px(2)} 0 rgb(0 0 0 / 0.25)`,
        }}
      >
        {(title || icon) && (
          <div className="flex items-center" style={{ gap: px(5) }}>
            {title && (
              <span data-slot="game-tip-title" className="leading-tight font-bold" style={{ color: GAME_TIP_COLOURS.title }}>
                {title}
              </span>
            )}
            {icon}
          </div>
        )}
        {rarity && (
          <div data-slot="game-tip-rarity" className="leading-tight" style={{ color: rarity.colour ?? GAME_TIP_COLOURS.text, fontSize: px(L.fontSize * 0.75) }}>
            {rarity.label}
          </div>
        )}
        {text.length > 0 && (
          <p data-slot="game-tip-text" className="m-0 font-normal whitespace-pre-line" style={{ color: GAME_TIP_COLOURS.text, lineHeight: 1.15 }}>
            {text.map((run, i) => (
              <span key={i} data-style={run.style} style={run.style ? { color: RUN_COLOURS[run.style] } : undefined}>
                {run.text}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

/** The rarity line for a relic or potion: "Rare Relic", coloured as the game colours that rarity. */
export function rarityLine(kind: "relic" | "potion", stats: ItemStats | undefined): { label: string; colour?: string } | undefined {
  const r = stats?.rarity;
  if (!r) return undefined;
  const noun = kind === "relic" ? "Relic" : "Potion";
  return { label: r === "None" ? noun : `${r} ${noun}`, colour: RARITY_COLOURS[r] };
}

/**
 * The game's hover tip for a relic or potion id: its name, rarity and description with real numbers
 * from the manifest's `relic` / `potion` stats, else its plain description. Unknown ids show their
 * tidied name only.
 */
export function ItemTip(props: { id: string; scale?: number; showRarity?: boolean; className?: string }) {
  const { id, scale, showRarity = true, className } = props;
  const a = useSpireAsset(id);
  const kind = id.startsWith("POTION.") ? "potion" : "relic";
  const stats = a.source === "extracted" ? (kind === "relic" ? a.relic : a.potion) : undefined;
  const runs = stats?.descriptionRuns;
  const description = stats?.description ?? (a.source === "extracted" ? a.description : undefined);
  return (
    <GameTip
      title={a.name}
      {...(runs ? { runs } : description ? { description } : {})}
      {...(showRarity && rarityLine(kind, stats) ? { rarity: rarityLine(kind, stats)! } : {})}
      {...(scale !== undefined ? { scale } : {})}
      {...(className ? { className } : {})}
    />
  );
}
