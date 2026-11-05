# Spire UI

A dark, slate-teal React + Tailwind v4 component kit, distributed as a shadcn registry.

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
| Display (`--font-spire-display`) | Kreon | SIL Open Font License 1.1 |
| Body (`--font-spire-body`) | Spectral | SIL Open Font License 1.1 |

The kit ships no game art, text or fonts. Both fonts are available from Google Fonts (https://fonts.google.com/specimen/Kreon, https://fonts.google.com/specimen/Spectral). Load them yourself, e.g. via Google Fonts or `@fontsource`.

## Development

```sh
bun install
bun run registry:build   # shadcn build -o apps/docs/public/r
bun run test
```

## Licence

Code is MIT, see [LICENSE](LICENSE).
