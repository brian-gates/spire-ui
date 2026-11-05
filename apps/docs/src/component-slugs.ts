// The component pages, in nav order. A plain list (no React) so the docs, the route table and the
// e2e tests share one source; routes.ts checks it matches the docs in components-docs.tsx.
export const COMPONENT_SLUGS = ["icon", "panel", "banner", "button", "badge", "divider", "tooltip", "tabs", "dialog", "class-badge", "stat", "relic-strip", "potion-slots", "run-header", "player-row", "run-row", "card-frame", "game-card", "map-node"] as const;
export type ComponentSlug = (typeof COMPONENT_SLUGS)[number];
