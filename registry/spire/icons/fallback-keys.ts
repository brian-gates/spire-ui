export type FallbackKey =
  | "relic" | "potion" | "card"
  | "class.ironclad" | "class.silent" | "class.defect" | "class.regent" | "class.necrobinder" | "class.unknown"
  | "room.monster" | "room.elite" | "room.rest" | "room.shop" | "room.treasure" | "room.event" | "room.boss" | "room.unknown"
  | "stat.hp" | "stat.gold" | "stat.energy" | "stat.ascension" | "stat.deck";

const CLASSES = ["IRONCLAD", "SILENT", "DEFECT", "REGENT", "NECROBINDER"];
const ROOMS = ["MONSTER", "ELITE", "REST", "SHOP", "TREASURE", "EVENT", "BOSS"];
const STATS = ["HP", "GOLD", "ENERGY", "ASCENSION", "DECK"];

export function fallbackKeyFor(id: string): FallbackKey {
  const dot = id.indexOf(".");
  const prefix = dot < 0 ? "" : id.slice(0, dot);
  const rest = dot < 0 ? "" : id.slice(dot + 1);
  switch (prefix) {
    case "RELIC": return "relic";
    case "POTION": return "potion";
    case "CARD": return "card";
    case "CHARACTER":
      return CLASSES.includes(rest) ? (`class.${rest.toLowerCase()}` as FallbackKey) : "class.unknown";
    case "ROOM":
      return ROOMS.includes(rest) ? (`room.${rest.toLowerCase()}` as FallbackKey) : "room.unknown";
    case "STAT":
      return STATS.includes(rest) ? (`stat.${rest.toLowerCase()}` as FallbackKey) : "relic";
    default: return "relic";
  }
}
