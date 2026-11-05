# spire-ui (CLI)

Command-line companion to [Spire UI](../../README.md). It reads art from **your own local
install** of Slay the Spire 2 so you can use it with the components on your machine. It ships no
game art, text or fonts, and nothing it extracts should be committed or redistributed.

Unofficial fan project, not affiliated with Mega Crit.

Requires Node.js 20.9 or later.

## What is here so far

- `src/pck.ts`: reads a Godot 4 resource pack (`.pck`, directory format v3) by offset; only the
  header and directory are read up front. Encrypted packs, sparse bundles and packs embedded in an
  executable are rejected rather than guessed at.
- `src/ctex.ts`: decodes a Godot 4 `CompressedTexture2D` (`.ctex`) to PNG: lossless PNG/WebP,
  uncompressed RGB8/RGBA8, and the VRAM formats DXT1 (BC1), DXT5 (BC3) and BPTC (BC7).

## Development

```sh
bun run --cwd packages/cli test        # vitest
bun run --cwd packages/cli typecheck   # tsc -p packages/cli
bun run --cwd packages/cli build       # tsup -> dist/
```

Test fixtures are generated in the tests from tiny synthetic images; no game files are used.

## Credits

- Block-compressed texture decoding (`src/bcn.ts`) is a TypeScript port of the BC1, BC3 and BC7
  decoders from [bcdec](https://github.com/iOrange/bcdec) by Sergii Kudlai, used under its MIT
  licence (Copyright (c) 2022 Sergii Kudlai). The full licence text is in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which ships in the npm package, and is kept as
  a legal comment in `src/bcn.ts` so it survives bundling into `dist/`.
- Image encoding and WebP decoding use [sharp](https://sharp.pixelplumbing.com/) (Apache-2.0).

## Licence

MIT, see [LICENSE](LICENSE).
