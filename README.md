# Spire UI

A dark-first, warm-palette React + Tailwind v4 component kit, distributed as a shadcn registry.

Unofficial fan project, not affiliated with Mega Crit.

## Install

Registry items are served at `https://brian-gates.github.io/spire-ui/r/<name>.json`:

```sh
npx shadcn add https://brian-gates.github.io/spire-ui/r/spire-theme.json
npx shadcn add https://brian-gates.github.io/spire-ui/r/spire-utils.json
```

## Fonts

| Role | Font | Licence |
| --- | --- | --- |
| Display (`--font-spire-display`) | Cinzel | SIL Open Font License 1.1 |
| Body (`--font-spire-body`) | Source Serif 4 | SIL Open Font License 1.1 |

The kit ships no game art, text or fonts. Load the fonts yourself (Google Fonts or `@fontsource`).

## Development

```sh
bun install
bun run registry:build   # shadcn build -o apps/docs/public/r
bun run test
```

## Licence

Code is MIT, see [LICENSE](LICENSE).
