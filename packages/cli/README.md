# spire-ui (CLI)

Command-line companion to [Spire UI](../../README.md). It reads art from **your own local
install** of Slay the Spire 2 so you can use it with the components on your machine. It ships no
game art, text or fonts, and nothing it extracts should be committed or redistributed.

Unofficial fan project, not affiliated with Mega Crit.

Requires Node.js 20.9 or later.

## extract-art

```sh
npx spire-ui extract-art                 # finds a Steam install, writes ./public/spire
npx spire-ui extract-art --game-dir "D:/Games/Slay the Spire 2" --out public/spire --sizes 32,64
```

| Option | Default | |
|---|---|---|
| `--game-dir <dir>` | Steam's usual folders | Folder holding `Slay the Spire 2.pck` (on macOS the game folder or `SlayTheSpire2.app/Contents/Resources`). Without it the CLI looks in Steam's default library on macOS, Windows and Linux, plus every library listed in Steam's `libraryfolders.vdf`. |
| `--out <dir>` | `./public/spire` | Output folder, replaced as a whole on every run. |
| `--sizes <list>` | `64` | Icon box sizes in px. Icons keep their aspect ratio and are never upscaled. |
| `--kinds <list>` | `relic,potion,class,room,ui` | Add `card` for card portraits (off by default: no v1 component needs them). |
| `--fonts` | off | Also copy the game's fonts. |

Exit codes: `0` done, `2` a problem with the input (game not found, not a Godot 4 pack, encrypted
or unsupported pack, unreadable texture, an `--out` folder that is not a previous extraction, bad
options, or the filesystem refusing to write `--out`: permissions, full or read-only disk, a file
in the way), `1` anything unexpected. Errors are one line on stderr.

### Output

```
<out>/manifest.json
<out>/<kind>/<slug>@<size>.webp     e.g. relic/ring_of_the_snake@64.webp
<out>/fonts/<name>.ttf              only with --fonts
<out>/.spire-ui-art                 marker: this folder is spire-ui output
```

`manifest.json` follows the `SpireManifest` schema (version 1) that Spire UI's `<SpireAssets>`
reads. Each item's `file` (relative to the manifest) is the **largest** requested size, and `w`/`h`
are that file's pixel size. Two top-level fields are additions the resolver ignores:

- `generator: "spire-ui"`: marks the manifest as written by this CLI (see below).
- `sizes`: every icon exists at each listed size at the same path with `@<size>` changed, so
  `relic/anchor@64.webp` has a `relic/anchor@32.webp` sibling when you pass `--sizes 32,64`.

`gameVersion` comes from the `release_info.json` Steam installs beside the pack (or one inside the
pack, if a future build moves it there), else `unknown`.

What is extracted:

- `RELIC.*`, `POTION.*` (and `CARD.*` with `--kinds card`): every id in the game's English
  localization, with its name and description as plain text (markup removed, runtime numbers shown
  as `X`). Art is the full-size image, else the atlas sprite, else the beta art the game shows for
  items without final art. Ids with no art at all are counted as "ids without art" and left out of
  the manifest, so components draw their fallback.
- `CHARACTER.IRONCLAD|SILENT|DEFECT|REGENT|NECROBINDER`: top panel character icons.
- `ROOM.MONSTER|ELITE|REST|SHOP|TREASURE|EVENT`: run history room icons; `ROOM.UNKNOWN`: the
  map's `?` icon. `ROOM.BOSS` has no generic icon in the game (each boss has its own), so it keeps
  the fallback.
- `STAT.HP|GOLD|ASCENSION|DECK`: top bar icons; `STAT.ENERGY`: the colourless energy orb.
- `--fonts`: the game's Kreon Bold and Spectral Bold, as the TrueType files the game embeds (not
  subset or converted), recorded as `fonts.display` and `fonts.body`. They are the game's copies,
  for local use only.

The output is written to `<out>.tmp-*` beside `<out>` and renamed into place only when everything
succeeded, so a failed or interrupted run never leaves a partial `<out>`, and a failed re-run keeps
the previous output. An existing `<out>` is replaced only if it is empty or provably a previous
extraction: it has the `.spire-ui-art` marker, a `manifest.json` with `generator: "spire-ui"`,
`schemaVersion: 1` and an `items` object, and nothing at its top level besides the kind folders,
`fonts/`, `manifest.json` and the marker. Anything else (a web app's `public/` with its own
`manifest.json`, or a previous output where you added a file) is refused with exit code 2 and
left untouched, so point `--out` at a folder of its own such as `public/spire`. If the previous
output cannot be deleted after the new one is in place, the run still succeeds and warns with the
leftover `<out>.old-*` path. Names inside the pack are never used as output paths: files are named
from a fixed kind, a `[a-z0-9_-]` slug and the size.

## Internals

- `src/pck.ts`: reads a Godot 4 resource pack (`.pck`, directory format v3) by offset; only the
  header and directory are read up front. Encrypted packs, sparse bundles and packs embedded in an
  executable are rejected rather than guessed at.
- `src/ctex.ts`: decodes a Godot 4 `CompressedTexture2D` (`.ctex`) to PNG: lossless PNG/WebP,
  uncompressed RGB8/RGBA8, and the VRAM formats DXT1 (BC1), DXT5 (BC3) and BPTC (BC7).
- `src/godot.ts`: `.import` remaps, AtlasTexture `.tres`, localization text, RSCC-compressed
  resources (zstd, deflate, gzip) and the font embedded in an imported FontFile.
- `src/extract.ts`: id to texture mapping, image output, manifest and the atomic swap.
- `src/game-paths.ts`: Steam install folders per OS.
- `src/manifest.ts`: a copy of the resolver's `SpireManifest` type; a test fails if they differ.

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
- zstd decompression uses [fzstd](https://github.com/101arrowz/fzstd) (MIT), so Node 20 works
  without a native zstd.

## Licence

MIT, see [LICENSE](LICENSE).
