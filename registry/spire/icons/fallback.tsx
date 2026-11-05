import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/cn";
import { fallbackKeyFor, type FallbackKey } from "./fallback-keys";

export { fallbackKeyFor, type FallbackKey };

/** Original simple silhouettes on a 24x24 grid, filled with currentColor. */
const ART: Record<FallbackKey, ReactNode> = {
  // gem
  relic: <path d="M7 4h10l4 5-9 11L3 9l4-5Zm1.6 5L12 16l3.4-7H8.6Z" fillRule="evenodd" />,
  // round-bottom flask
  potion: <path d="M9 3h6v2h-1v4.2A6.5 6.5 0 1 1 10 9.2V5H9V3Z" />,
  // card rectangle with a diamond
  card: <path d="M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm6 5-4 5 4 5 4-5-4-5Z" fillRule="evenodd" />,
  // armoured helm with a slit
  "class.ironclad": <path d="M12 2 4 5v7c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5l-8-3Zm-5 8h10v2H7v-2Z" fillRule="evenodd" />,
  // two crossed daggers
  "class.silent": <path d="m5 3 6 6-2 2-4-4V3Zm14 0v4l-4 4-2-2 6-6ZM9.5 12.5l2.5 2.5 2.5-2.5 5 5-2 2-3.5-3.5-2 2-2-2-3.5 3.5-2-2 5-5Z" />,
  // orb inside a ring with nodes
  "class.defect": <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM1.5 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm17 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />,
  // crown
  "class.regent": <path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11H3Zm1 2h16v2H4v-2Z" />,
  // wisp with a hollow
  "class.necrobinder": <path d="M12 2c4 3 7 6.5 7 11a7 7 0 0 1-14 0c0-2.2.8-4 2-5.5 0 2 1 3 2.5 3C9 7 10 4.5 12 2Zm0 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" fillRule="evenodd" />,
  "class.unknown": <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 14v2h2v-2h-2Zm1-9c-1.7 0-3 1.1-3 2.8h2c0-.6.4-.9 1-.9s1 .3 1 .8c0 1.3-2 1.2-2 3.3h2c0-1.4 2-1.5 2-3.3C15 8.1 13.8 7 12 7Z" fillRule="evenodd" />,
  // skull
  "room.monster": <path d="M12 3c4.4 0 8 3 8 7.5 0 2.4-1 4-2.5 5V20h-3v-2h-1v2h-3v-2h-1v2h-3v-4.5C5 14.5 4 12.9 4 10.5 4 6 7.6 3 12 3ZM8.5 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fillRule="evenodd" />,
  // horned skull
  "room.elite": <path d="M3 2c0 4 1.5 6 4 7-.5 1-.5 2-.5 3 0 2 1 3.5 2.5 4.5V21h6v-4.5c1.5-1 2.5-2.5 2.5-4.5 0-1 0-2-.5-3 2.5-1 4-3 4-7-2 2-4 3-6.5 3.2C13 5 11 5 8.5 5.2 6 5 4.5 4 3 2Zm5.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fillRule="evenodd" />,
  // campfire: flame over logs
  "room.rest": <path d="M12 2c1 3 4.5 5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.5.6-2.8 1.5-3.8.2 1 .8 1.6 1.5 1.8C10.2 6.7 11 4.5 12 2ZM3 19l1-2 8 3 8-3 1 2-9 3.5L3 19Z" />,
  // coin bag
  "room.shop": <path d="M9 2h6l-1.5 3C17 6.5 20 10 20 14.5 20 18.5 17 22 12 22s-8-3.5-8-7.5C4 10 7 6.5 10.5 5L9 2Zm2 8v1.2c-1.2.3-2 1-2 2s.8 1.7 2.3 2c.8.2 1 .4 1 .7s-.3.6-.9.6c-.7 0-1.2-.3-1.4-.8l-1.5.6c.3 1 1.1 1.6 2.5 1.8V18h1.5v-1.2c1.4-.3 2.1-1 2.1-2.1 0-1.1-.9-1.7-2.2-2-.8-.2-1-.4-1-.7 0-.3.3-.5.8-.5s.9.2 1.1.6l1.4-.6c-.3-.8-1-1.3-1.9-1.5V10H11Z" fillRule="evenodd" />,
  // chest
  "room.treasure": <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5H3V6Zm0 6h7v2h4v-2h7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7Z" />,
  // question mark in a diamond
  "room.event": <path d="M12 1.5 22.5 12 12 22.5 1.5 12 12 1.5Zm-1 14.5v2h2v-2h-2Zm1-9c-1.7 0-3 1.1-3 2.8h2c0-.6.4-.9 1-.9s1 .3 1 .8c0 1.3-2 1.2-2 3.3h2c0-1.4 2-1.5 2-3.3C15 8.1 13.8 7 12 7Z" fillRule="evenodd" />,
  // large skull with crown spikes
  "room.boss": <path d="M3 8 6 10l3-6 3 4 3-4 3 6 3-2-1.5 8H17v4H7v-4H4.5L3 8Zm5.5 5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Zm7 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z" fillRule="evenodd" />,
  "room.unknown": <path d="M3 3h6v2H5v4H3V3Zm12 0h6v6h-2V5h-4V3ZM3 15h2v4h4v2H3v-6Zm16 0h2v6h-6v-2h4v-4ZM10 10h4v4h-4v-4Z" />,
  // heart
  "stat.hp": <path d="M12 21C5 15.5 2.5 12 2.5 8.5A5 5 0 0 1 12 6.5a5 5 0 0 1 9.5 2C21.5 12 19 15.5 12 21Z" />,
  // coin
  "stat.gold": <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" fillRule="evenodd" />,
  // energy orb with a spark
  "stat.energy": <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 4-5 7h3.5L10.5 18l5-7H12l1-5Z" fillRule="evenodd" />,
};

export function FallbackIcon(props: { k: FallbackKey; tint?: string; className?: string; title: string }) {
  const { k, tint, className, title } = props;
  const color = tint ?? (k.startsWith("class.") && k !== "class.unknown" ? `var(--color-${k.replace(".", "-")})` : undefined);
  const style: CSSProperties | undefined = color ? { color } : undefined;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      className={cn("shrink-0", className)}
      style={style}
    >
      <title>{title}</title>
      {ART[k]}
    </svg>
  );
}
