import { useState, type CSSProperties, type ReactNode } from "react";
import { FallbackIcon } from "../icons/fallback";
import { resolveAsset, type CardLayout, type CardLayoutBox, type CardStats, type CardTextRun, type Resolved } from "../lib/assets";
import { useSpireAsset, useSpireManifest } from "../lib/assets-provider";
import { cn } from "../lib/cn";
import { CardFrame } from "./card-frame";

/**
 * The game's own card layout (scenes/cards/card.tscn), in its pixels from the frame's top left. The
 * manifest's `cardLayout` (read from the same scene by `extract-art`) wins when present.
 */
export const GAME_CARD_LAYOUT: CardLayout = {
  w: 300,
  h: 422,
  boxes: {
    frame: { x: 0, y: 0, w: 300, h: 422 },
    portrait: { x: 25, y: 43, w: 250, h: 190 },
    portraitBorder: { x: 12.5, y: 47, w: 275, h: 210 },
    banner: { x: -13, y: 4, w: 327, h: 83 },
    title: { x: 45, y: 7, w: 210, h: 54, fontSize: 26 },
    plaque: { x: 119.5, y: 212, w: 61, h: 37, fontSize: 16 },
    orb: { x: -16, y: -16, w: 64, h: 64, fontSize: 32 },
    star: { x: -36, y: 22, w: 58, h: 58, fontSize: 22 },
    text: { x: 28, y: 248, w: 243, h: 136, fontSize: 21 },
  },
};
const PARTS = ["frame", "portrait", "portraitBorder", "banner", "title", "plaque", "orb", "star", "text"] as const;
type Part = (typeof PARTS)[number];

/** Frame material (`card.frame`) -> piece colour, and the energy orb the game pairs with it. */
const COLOURS: Record<string, { colour: string; orb: string }> = {
  card_frame_red: { colour: "RED", orb: "IRONCLAD" },
  card_frame_green: { colour: "GREEN", orb: "SILENT" },
  card_frame_blue: { colour: "BLUE", orb: "DEFECT" },
  card_frame_orange: { colour: "ORANGE", orb: "REGENT" },
  card_frame_pink: { colour: "PINK", orb: "NECROBINDER" },
  card_frame_colorless: { colour: "COLORLESS", orb: "COLORLESS" },
  card_frame_curse: { colour: "CURSE", orb: "COLORLESS" },
  card_frame_quest: { colour: "QUEST", orb: "QUEST" },
};
/** A character's frame, for cards whose manifest entry names no frame. */
const CHARACTER_FRAMES: Record<string, string> = {
  ironclad: "card_frame_red",
  silent: "card_frame_green",
  defect: "card_frame_blue",
  regent: "card_frame_orange",
  necrobinder: "card_frame_pink",
};
/** Card rarity -> banner material; rarities without one of their own wear the common banner. */
const BANNERS: Record<string, string> = {
  Basic: "COMMON", Common: "COMMON", Token: "COMMON", Uncommon: "UNCOMMON", Rare: "RARE",
  Curse: "CURSE", Event: "EVENT", Quest: "QUEST", Status: "STATUS", Ancient: "ANCIENT",
};
/** Card type -> frame and portrait border shape. */
const SHAPES: Record<string, string> = { Attack: "ATTACK", Power: "POWER", Skill: "SKILL", Status: "SKILL", Curse: "SKILL", Quest: "QUEST" };

/** CardFrame's types and rarities for the fallback. */
type FrameProps = Parameters<typeof CardFrame>[0];
const FALLBACK_TYPES: Record<string, FrameProps["type"]> = { Attack: "attack", Skill: "skill", Power: "power", Status: "status", Curse: "curse" };
const FALLBACK_RARITIES: Record<string, FrameProps["rarity"]> = { Basic: "starter", Common: "common", Uncommon: "uncommon", Rare: "rare", Event: "event" };

/** Keyword lines the game draws above the card's text, and below it. */
const KEYWORDS_BEFORE = ["Unplayable", "Innate", "Ethereal", "Retain", "Sly"];
const KEYWORDS_AFTER = ["Exhaust", "Eternal"];

/** Which pieces draw a card: frame colour from its frame (else pool or `character`), shape from its type, banner from its rarity. */
export function gameCardPieces(card: Pick<CardStats, "type" | "rarity" | "frame" | "pool">, character?: string) {
  const who = (character ?? "").replace(/^CHARACTER\./i, "").toLowerCase();
  const frameKey = (card.frame && COLOURS[card.frame] ? card.frame : undefined) ?? CHARACTER_FRAMES[card.pool ?? ""] ?? CHARACTER_FRAMES[who] ?? "card_frame_colorless";
  const { colour, orb } = COLOURS[frameKey]!;
  const shape = SHAPES[card.type] ?? "SKILL";
  const banner = BANNERS[card.rarity] ?? "COMMON";
  const borderShape = shape === "QUEST" ? "SKILL" : shape;
  return {
    frame: shape === "QUEST" ? "UI.CARD_FRAME.QUEST.QUEST" : `UI.CARD_FRAME.${shape}.${colour}`,
    banner: `UI.CARD_BANNER.${banner}`,
    portraitBorder: `UI.CARD_PORTRAIT_BORDER.${borderShape}.${banner}`,
    plaque: `UI.CARD_PLAQUE.${banner}`,
    orb: `UI.CARD_ORB.${orb}`,
    star: "UI.CARD_STAR",
  };
}

/** "Strike", "Strike+", "Searing Blow+3". */
function shownName(name: string, upgrades: number): string {
  return upgrades <= 0 ? name : upgrades === 1 ? `${name}+` : `${name}+${upgrades}`;
}

const TEXT_STYLE: Record<NonNullable<CardTextRun["style"]>, string> = {
  number: "text-[#fff6e2]",
  upgraded: "text-[#7fff5e]",
  gold: "text-[#efc851]",
  blue: "text-[#87ceeb]",
  purple: "text-[#ee82ee]",
};

/** The card's text runs: the manifest's styled runs, else its plain text with numbers marked. */
function textRuns(card: CardStats, upgraded: boolean): CardTextRun[] {
  const runs = upgraded ? (card.upgradedDescriptionRuns ?? card.descriptionRuns) : card.descriptionRuns;
  if (runs && (!upgraded || card.upgradedDescriptionRuns || !card.upgradedDescription)) return runs;
  const plain = (upgraded ? (card.upgradedDescription ?? card.description) : card.description) ?? "";
  return plain.split(/(\d+)/).filter(Boolean).map((t) => (/^\d+$/.test(t) ? { text: t, style: "number" as const } : { text: t }));
}

function keywordsOf(card: CardStats, upgraded: boolean): { before: string[]; after: string[] } {
  const all = (upgraded ? (card.upgradedKeywords ?? card.keywords) : card.keywords) ?? [];
  return { before: KEYWORDS_BEFORE.filter((k) => all.includes(k)), after: [...KEYWORDS_AFTER, ...all.filter((k) => !KEYWORDS_BEFORE.includes(k) && !KEYWORDS_AFTER.includes(k))].filter((k) => all.includes(k)) };
}

/** Text size so long descriptions fit the panel, as the game's label shrinks (21px down to 12px). */
function textScale(chars: number, lines: number): number {
  const load = chars / 70 + Math.max(0, lines - 3) * 0.35;
  return load <= 1 ? 1 : Math.max(12 / 21, 1 / Math.sqrt(load));
}

/** An image piece: srcset sized to its share of the card's rendered width. */
function Piece(props: { asset: Resolved; style: CSSProperties; px: number; fit: "contain" | "cover" | "fill"; slot: string }) {
  const { asset, style, px, fit, slot } = props;
  if (asset.source !== "extracted") return null;
  return (
    <img
      data-slot={slot}
      alt=""
      draggable={false}
      {...(asset.srcSet ? { sizes: `${px}px`, srcSet: asset.srcSet } : {})}
      src={asset.src}
      className="pointer-events-none absolute select-none"
      style={{ ...style, objectFit: fit }}
    />
  );
}

/**
 * A card drawn the way the game draws it, from the pieces `extract-art` writes (UI.CARD_FRAME.*,
 * UI.CARD_BANNER.*, ...) and the card's own art and stats: cost on the energy orb, the name on the
 * banner (green, with "+", when upgraded), type on the plaque and the text on the frame's panel,
 * numbers coloured (green where the upgrade changed them) and keywords gold. Without those pieces or
 * stats it falls back to the original CardFrame.
 *
 * It fills its container's width (set it with `className`, e.g. "w-60") and scales with it; pass the
 * rendered width in `width` so the browser picks the right image sizes.
 */
export function GameCard(props: {
  id: string;
  /** Upgrade count: 0 for a plain card, 1 for "+", more for cards like Searing Blow. */
  upgrades?: number;
  /** The player's character, for the frame colour of a card whose stats name none. */
  character?: string;
  /** Rendered CSS width in px, for srcset `sizes` (default 300). */
  width?: number;
  className?: string;
}) {
  const { id, upgrades = 0, character, width = 300, className } = props;
  const art = useSpireAsset(id);
  const { base, manifest } = useSpireManifest();
  const [artFailed, setArtFailed] = useState<string | null>(null);
  const card = art.source === "extracted" ? art.card : undefined;
  const upgraded = upgrades > 0;
  const name = shownName(art.name, upgrades);

  const ids = card ? gameCardPieces(card, character) : null;
  const assets = ids && manifest ? Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, resolveAsset(v, manifest, base)])) as Record<keyof typeof ids, Resolved> : null;
  const portrait: ReactNode =
    art.source === "extracted" && artFailed !== art.src ? (
      <img
        alt=""
        {...(art.srcSet ? { sizes: `${Math.round((250 / 330) * width)}px`, srcSet: art.srcSet } : {})}
        src={art.src}
        onError={() => setArtFailed(art.src)}
        className="size-full object-cover"
      />
    ) : (
      <FallbackIcon k="card" title="" className="size-1/3 text-[#8d9a96]" />
    );

  const typeLabel = card?.type ?? "Card";
  const cost = card ? (upgraded && typeof card.cost === "number" && card.upgradedCost !== undefined ? card.upgradedCost : card.cost) : null;
  const label = [name, typeLabel, card?.rarity, cost === null ? (card ? "Unplayable" : null) : `cost ${cost}`, card?.starCost !== undefined ? `${card.starCost} stars` : null].filter(Boolean).join(", ");

  if (!card || !assets || assets.frame.source !== "extracted") {
    const type = FALLBACK_TYPES[card?.type ?? ""] ?? "skill";
    const r = FALLBACK_RARITIES[card?.rarity ?? ""] ?? "common";
    const words = card ? keywordsOf(card, upgraded) : null;
    return (
      <div data-slot="game-card" data-variant="fallback" className={cn("w-fit", className)}>
        <CardFrame id={id} name={art.name} cost={cost} type={type} rarity={r} character={card?.frame ? COLOURS[card.frame]?.orb.toLowerCase() : (card?.pool ?? character)} upgraded={upgraded}>
          {art.source === "extracted" ? portrait : undefined}
        </CardFrame>
        {card && (
          <p data-slot="game-card-text" className="m-0 mt-2 max-w-44 text-center text-sm leading-snug text-spire-ink">
            {[...words!.before.map((k) => ({ text: `${k}. `, style: "gold" as const })), ...textRuns(card, upgraded), ...words!.after.map((k) => ({ text: ` ${k}.`, style: "gold" as const }))].map((run, i) => (
              <span key={i} className={run.style ? TEXT_STYLE[run.style] : undefined}>{run.text}</span>
            ))}
          </p>
        )}
      </div>
    );
  }

  const given = manifest?.cardLayout;
  const layout = given && PARTS.every((p) => given.boxes[p]) ? given : GAME_CARD_LAYOUT;
  const box = (p: Part) => layout.boxes[p]!;
  const hasStar = card.starCost !== undefined;
  // Everything is placed in a box that holds the frame, banner and orb (and the star when shown).
  const parts: Part[] = ["frame", "banner", "orb", ...(hasStar ? (["star"] as const) : [])];
  const minX = Math.min(...parts.map((p) => box(p).x));
  const minY = Math.min(...parts.map((p) => box(p).y));
  const bboxW = Math.max(...parts.map((p) => box(p).x + box(p).w)) - minX;
  const bboxH = Math.max(...parts.map((p) => box(p).y + box(p).h)) - minY;
  const cq = (px: number) => `${((px / bboxW) * 100).toFixed(3)}cqw`;
  const place = (b: CardLayoutBox): CSSProperties => ({
    left: `${(((b.x - minX) / bboxW) * 100).toFixed(3)}%`,
    top: `${(((b.y - minY) / bboxH) * 100).toFixed(3)}%`,
    width: `${((b.w / bboxW) * 100).toFixed(3)}%`,
    height: `${((b.h / bboxH) * 100).toFixed(3)}%`,
  });
  const px = (b: CardLayoutBox) => Math.max(1, Math.round((b.w / bboxW) * width));
  const at = (p: Part) => ({ style: place(box(p)), px: px(box(p)) });
  const fill: CSSProperties = { inset: 0, width: "100%", height: "100%" };
  const outline = (px: number, colour: string): CSSProperties => ({ WebkitTextStroke: `${cq(px)} ${colour}`, paintOrder: "stroke fill" });

  const runs = textRuns(card, upgraded);
  const words = keywordsOf(card, upgraded);
  const lines = runs.reduce((n, r) => n + (r.text.match(/\n/g)?.length ?? 0), 1) + words.before.length + words.after.length;
  const chars = runs.reduce((n, r) => n + r.text.length, 0) + [...words.before, ...words.after].join("  ").length;
  const textSize = (box("text").fontSize ?? 21) * textScale(chars, lines);
  const plaque = assets.plaque;
  const costChanged = upgraded && card.upgradedCost !== undefined && typeof card.cost === "number";

  return (
    <div
      data-slot="game-card"
      data-variant="game"
      role="group"
      aria-label={label}
      className={cn("relative w-full select-none [container-type:inline-size]", className)}
      style={{ aspectRatio: `${bboxW} / ${bboxH}` }}
    >
      <div data-slot="game-card-portrait" className="absolute flex items-center justify-center overflow-hidden bg-[#1b2124]" style={place(box("portrait"))}>
        {portrait}
      </div>
      <Piece {...at("frame")} slot="game-card-frame" asset={assets.frame} fit="fill" />
      <div
        data-slot="game-card-text"
        className="font-spire-display absolute flex flex-col items-center justify-center text-center whitespace-pre-line text-[#fff6e2]"
        style={{ ...place(box("text")), fontSize: cq(textSize), lineHeight: 1.12, fontWeight: 400, textShadow: `${cq(2)} ${cq(2)} 0 rgb(0 0 0 / 0.25)` }}
      >
        <p className="m-0">
          {words.before.map((k, i) => (
            <span key={k} className={TEXT_STYLE.gold}>{`${i > 0 ? "\n" : ""}${k}.`}</span>
          ))}
          {runs.length > 0 && words.before.length > 0 && "\n"}
          {runs.map((run, i) => (
            <span key={i} data-style={run.style} className={run.style ? TEXT_STYLE[run.style] : undefined}>{run.text}</span>
          ))}
          {words.after.map((k, i) => (
            <span key={k} className={TEXT_STYLE.gold}>{`${i > 0 || runs.length > 0 || words.before.length > 0 ? "\n" : ""}${k}.`}</span>
          ))}
        </p>
      </div>
      <Piece {...at("portraitBorder")} slot="game-card-border" asset={assets.portraitBorder} fit="contain" />
      <Piece {...at("banner")} slot="game-card-banner" asset={assets.banner} fit="cover" />
      <div
        data-slot="game-card-name"
        className={cn("font-spire-display absolute flex items-center justify-center text-center leading-none whitespace-nowrap", upgraded ? "text-[#7fff5e]" : "text-[#fff6e2]")}
        style={{ ...place(box("title")), fontSize: cq(Math.min(box("title").fontSize ?? 26, (box("title").w / Math.max(1, name.length)) * 1.9)), fontWeight: 700, ...outline(7, "#4d4b40") }}
      >
        {name}
      </div>
      {plaque.source === "extracted" && (
        <div
          data-slot="game-card-type"
          className="font-spire-display absolute flex items-center justify-center leading-none text-black/75"
          style={{
            ...place(box("plaque")),
            left: `${(((box("plaque").x + box("plaque").w / 2 - minX) / bboxW) * 100).toFixed(3)}%`,
            width: "auto",
            minWidth: `${((box("plaque").w / bboxW) * 100).toFixed(3)}%`,
            transform: "translateX(-50%)",
            padding: `0 ${cq(13)}`,
            fontSize: cq(box("plaque").fontSize ?? 16),
            fontWeight: 700,
            borderStyle: "solid",
            borderWidth: `0 ${cq(12)} 0 ${cq(13)}`,
            borderImage: `url("${plaque.src}") 0 ${Math.round((24 / 123) * plaque.w)} 0 ${Math.round((26 / 123) * plaque.w)} fill / 0 ${cq(12)} 0 ${cq(13)}`,
            boxSizing: "border-box",
          }}
        >
          {typeLabel}
        </div>
      )}
      {cost !== null && assets.orb.source === "extracted" && (
        <div data-slot="game-card-cost" className="absolute" style={place(box("orb"))}>
          <Piece style={fill} px={px(box("orb"))} slot="game-card-orb" asset={assets.orb} fit="contain" />
          <span
            className={cn("font-spire-display absolute inset-0 flex items-center justify-center leading-none", costChanged ? "text-[#7fff5e]" : "text-[#fff6e2]")}
            style={{ fontSize: cq(box("orb").fontSize ?? 32), fontWeight: 700, ...outline(8, "#2b2620") }}
          >
            {cost}
          </span>
        </div>
      )}
      {hasStar && assets.star.source === "extracted" && (
        <div data-slot="game-card-star" className="absolute" style={place(box("star"))}>
          <Piece style={fill} px={px(box("star"))} slot="game-card-star-icon" asset={assets.star} fit="contain" />
          <span className="font-spire-display absolute inset-0 flex items-center justify-center leading-none text-[#fff6e2]" style={{ fontSize: cq(box("star").fontSize ?? 22), fontWeight: 700, ...outline(6, "#1a5e6b") }}>
            {card.starCost}
          </span>
        </div>
      )}
    </div>
  );
}
