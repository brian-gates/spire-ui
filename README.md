# Spire UI

A fan-made React + Tailwind v4 UI kit themed on Slay the Spire 2: a dark slate-teal palette, panels, run summaries, relic and potion strips, map nodes and more. It is distributed as a [shadcn registry](https://ui.shadcn.com/docs/registry), so you copy components into your own source tree instead of depending on a package. It needs React 19 and Tailwind CSS v4.

- Docs: https://brian-gates.github.io/spire-ui/
- Storybook: https://brian-gates.github.io/spire-ui/storybook/

Unofficial fan project, not affiliated with Mega Crit.

## Install

1. Set up shadcn if your project does not use it yet. Any base (Radix or Base UI) works.

   ```sh
   npx shadcn@latest init
   ```

2. Add a component. Each item pulls in what it needs: the theme, the `cn` helper, the icon set and any other components it is built from.

   ```sh
   npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-run-row.json
   ```

   Registry URLs have the form `https://brian-gates.github.io/spire-ui/r/spire-<name>.json`. The theme alone is `spire-theme`.

3. Import the theme after Tailwind. It is installed at `styles/spire.css`; use a path relative to your CSS file:

   ```css
   @import "tailwindcss";
   @import "../styles/spire.css";
   ```

   `spire.css` styles `body` (background, text colour and body font) in `@layer base`, so it applies to your whole page.

4. Load the fonts yourself. Kreon (display) and Spectral (body) are both SIL Open Font License 1.1 and available from [Google Fonts](https://fonts.google.com/specimen/Kreon) ([Spectral](https://fonts.google.com/specimen/Spectral)) or Fontsource:

   ```sh
   npm install @fontsource/kreon @fontsource/spectral
   ```

5. Use it. In a Vite app components land under `lib/spire/` next to `src/`:

   ```tsx
   import { RunRow } from "../lib/spire/game/run-row";

   <RunRow run={run} />
   ```

Without a game-art manifest every icon uses the kit's original fallback set.

## Components

Primitives: Badge, Banner, Button, Dialog, Divider, Panel, SpireIcon, Tabs, Tooltip.

Game components: CardFrame, GameCard, ClassBadge, MapNode, PlayerRow, PotionSlots, RelicStrip, RunHeader, RunRow, StatHP, StatGold, StatEnergy, StatDeck.

Each component page in the docs lists its own install command.

## Your own game art (optional)

The `spire-ui` CLI reads art from your own local install of the game and writes a manifest the components can use. Nothing it extracts should be committed or redistributed.

```sh
npx spire-ui extract-art
```

See the [CLI README](packages/cli/README.md) and the [extract-art docs](https://brian-gates.github.io/spire-ui/extract-art).

## Licensing

Code is MIT, see [LICENSE](LICENSE). No game assets, text or fonts are shipped. The CLI's BC7 texture decoder is a port of [bcdec](https://github.com/iOrange/bcdec) (MIT, Copyright (c) 2022 Sergii Kudlai); see [THIRD_PARTY_NOTICES.md](packages/cli/THIRD_PARTY_NOTICES.md).

## Development

```sh
bun install
bun run registry:build   # shadcn build -o apps/docs/public/r
bun run test
```
