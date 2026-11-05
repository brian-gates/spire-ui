# spire-ui (CLI)

Command-line companion to [Spire UI](https://github.com/brian-gates/spire-ui#readme). It reads art from **your own local
install** of Slay the Spire 2 so you can use it with the components on your machine. It ships no
game art, text or fonts, and nothing it extracts should be committed or redistributed.

Unofficial fan project, not affiliated with Mega Crit.

Requires Node.js 20.9 or later.

## extract-art

```sh
npx spire-ui extract-art                 # finds a Steam install, writes ./public/spire
npx spire-ui extract-art --game-dir "D:/Games/Slay the Spire 2" --out public/spire --sizes 32,64
npx spire-ui extract-art --kinds card --sizes 64,128,256,512  # card art (up to 512px) plus each card's stats and text
```

| Option | Default | |
|---|---|---|
| `--game-dir <dir>` | Steam's usual folders | Folder holding `Slay the Spire 2.pck` (on macOS the game folder or `SlayTheSpire2.app/Contents/Resources`). Without it the CLI looks in Steam's default library on macOS, Windows and Linux, plus every library listed in Steam's `libraryfolders.vdf`. |
| `--out <dir>` | `./public/spire` | Output folder, replaced as a whole on every run. |
| `--sizes <list>` | `64,128,256` | Icon box sizes in px (up to 4096, at most 16 sizes), e.g. `64,128,256,512` for card art. Each icon is written once per size so browsers can pick one by rendered size and pixel density ([responsive sizes](#responsive-sizes)). Icons keep their aspect ratio and are never upscaled: sizes past an image's own size are skipped, and the first of them is written at the image's own size, so every icon has at least one file. |
| `--kinds <list>` | `relic,potion,class,room,ui` | Add `card` for card portraits plus [card stats](#card-stats) (off by default: no v1 component needs them). |
| `--fonts` | off | Also copy the game's fonts. |

Exit codes: `0` done, `2` a problem with the input (game not found, not a Godot 4 pack, encrypted
or unsupported pack, unreadable texture, an `--out` folder that is not a previous extraction, bad
options, or the filesystem refusing to write `--out`: permissions, full or read-only disk, a file
in the way), `1` anything unexpected. Errors are one line on stderr.

### Output

```
<out>/manifest.json
<out>/<kind>/<slug>@<width>.webp    e.g. relic/ring_of_the_snake@64.webp (named by actual pixel width)
<out>/fonts/<name>.ttf              only with --fonts
<out>/.spire-ui-art                 marker: this folder is spire-ui output
```

`manifest.json` follows the `SpireManifest` schema (version 1) that Spire UI's `<SpireAssets>`
reads. Each item's `file` (relative to the manifest) is its **largest** file, `w`/`h` are that
file's pixel size, and `widths` lists the pixel widths of all its files, ascending (the last is
`w`). Two top-level fields are additions the resolver ignores:

- `generator: "spire-ui"`: marks the manifest as written by this CLI (see below).
- `sizes`: the box sizes the run was asked for. Which files an item has is its `widths`.

#### Responsive sizes

Every file is named by its actual pixel width, so an item's siblings are `file` with `@<width>`
changed for each entry of `widths`. A 300x200 relic extracted with `--sizes 64,128,256,512` gets
`relic/x@64.webp`, `relic/x@128.webp`, `relic/x@256.webp` and `relic/x@300.webp` (512 would
upscale it, so the image is written once at its own 300px and 512 is skipped); a 40x48 potion gets
only `@40` (box 64 is its own size). A tall image's widths are smaller than the boxes: a 150x200
icon at box 64 is `@48`.

Spire UI's resolver turns `widths` into an `<img srcset>` (`relic/x@64.webp 64w, ...`) with `file`
as the `src` fallback, and `SpireIcon` sets `sizes` to its own CSS size (override it with a
`sizes` prop for fluid layouts), so a 32px icon loads the 64px file on a 2x screen and the
smallest one otherwise. Manifests written before `widths` existed have none; their items use
`file` only, as before. Components copied in before this change also use `file` only, which is now
the largest size, so update them (`shadcn add` the `spire-icon` item again) when you re-extract
with several sizes.

#### Card pieces

With the `ui` kind the run also writes the pieces the game draws a card from, as `ui` items:

- `UI.CARD_FRAME.<ATTACK|SKILL|POWER>.<COLOUR>` (colours `RED GREEN BLUE ORANGE PINK COLORLESS CURSE
  QUEST`, the suffix of a card's `frame`) and `UI.CARD_FRAME.QUEST.QUEST`. The frame includes the
  dark text panel.
- `UI.CARD_BANNER.<RARITY>`, `UI.CARD_PORTRAIT_BORDER.<SHAPE>.<RARITY>` and `UI.CARD_PLAQUE.<RARITY>`
  (rarities `COMMON UNCOMMON RARE CURSE EVENT QUEST STATUS ANCIENT`; the plaque is a nine-patch,
  26px left and 24px right at full size).
- `UI.CARD_ORB.<IRONCLAD|SILENT|DEFECT|REGENT|NECROBINDER|COLORLESS|QUEST>` and `UI.CARD_STAR`.

The game paints these in one base colour and recolours them with its `hsv` shader (a hue turn,
chroma scale and value scale in YIQ space), using a material per frame colour or per rarity. The
CLI applies the same arithmetic to each piece, so the files are already coloured; a piece whose
material is missing is left unmapped rather than written in the wrong colour. Trimmed sprite
margins are restored, so every piece has the size the card scene lays out. `--sizes` does not
apply to them: each is written at 1/4, 1/2 and 1x of its texture (the textures are 2x the game's
300x422 card).

#### Hover tip panel

Also with `ui`: `UI.HOVER_TIP`, the panel texture the game's hover tips (the relic and potion
tooltips) stretch, written as it is at 1/4, 1/2 and 1x. The item gets `slice`
(`{ left, top, right, bottom }`, in pixels of its largest file): the nine-patch borders from the
game's hover tip scene, less the part of the scene's region that overhangs the texture. Spire UI's
`GameTip` draws it as a CSS `border-image`.

The manifest gains a top-level `cardLayout` (`{ w: 300, h: 422, boxes: { portrait, frame,
portraitBorder, banner, title, plaque, orb, star, text } }`), read from the game's card scene: each
box in card pixels from the frame's top left, with `fontSize` for text. Spire UI's `GameCard`
composes the pieces with it.

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

### Relic and potion stats

With the `relic` and `potion` kinds (on by default), each `RELIC.*` / `POTION.*` item also gets a
`relic` / `potion` object, read from the game's code the same way as card stats (below):

```jsonc
"relic": {
  "rarity": "Common",               // the game's RelicRarity / PotionRarity name
  "pool": "shared",                 // the pool class listing it, e.g. "ironclad", "event"
  "description": "Gain 3 Block.",   // English text with its real numbers
  "descriptionRuns": [{ "text": "Gain " }, { "text": "3", "style": "blue" }, { "text": " Block." }]
}
```

Fields the reader cannot read are left out and named in `unknown` (`rarity`, `pool` for an item two
pools list, `vars`, `description` when a placeholder has no value outside a run). A text that picks
something during a run (a card, a relic) shows the game's own wording for when nothing is picked
yet. Without `sts2.dll` the run warns and writes the art without these objects.

### Card stats

With `--kinds card`, each `CARD.*` item also gets a `card` object read statically from the game's
own code, `sts2.dll` in the `data_sts2_*` folder beside the pack. The code is never run; the CLI
reads the assembly's metadata and follows a few small, fixed patterns in each card's IL (its
constructor, its constant getters, its variables and its `OnUpgrade`):

```jsonc
"CARD.EXAMPLE": {                   // an invented card, for illustration
  "kind": "card", "file": "card/example@256.webp", "w": 256, "h": 195, "name": "Example", ...
  "card": {
    "cost": 1,                      // energy; "X" for X-cost cards, null for unplayable ones
    "type": "Skill", "rarity": "Common", "target": "Self",
    "pool": "<pool title>", "frame": "<frame name>",
    "keywords": ["<keyword>"],        // upgradedKeywords when an upgrade changes them
    "vars": { "Cards": { "base": 3, "upgraded": 4 } },
    "description": "Toss 3 sparks.",
    "upgradedDescription": "Toss 4 sparks."
  }
}
```

Other optional fields: `upgradedCost`, `starCost` (cards that also cost stars), and `unknown`. Enum values
(`type`, `rarity`, `target`, keywords) are the game's own names. `vars` are the numbers the card
text uses, by placeholder name; a var the game recalculates during combat is marked
`"computed": true` and keeps `base` only when the code gives one. Anything the reader does not
recognise is never guessed: the field is left out and named in the card's `unknown` list (for
example `"target"` for the few cards whose target is decided at runtime).

`description` and `upgradedDescription` are the card's English text rendered with these numbers
as plain text (markup removed; energy and star icons written as `2 Energy`, `1 Star`; numbers that
only exist in combat shown as `X`). `descriptionRuns` and `upgradedDescriptionRuns` are the same
text as styled runs with line breaks kept: `{ "text": "7", "style": "upgraded" }`, where `style` is
`number` (a number the game colours), `upgraded` (one the upgrade changed) or the game's colour
tags `gold`, `blue`, `purple`. The item's own `description` is unchanged (numbers as `X`).

Stats ride on the card items, so a card needs its art to appear in the manifest; there is no
stats-only mode (pass a single small `--sizes` if you only want the stats). If `sts2.dll` is missing,
unreadable or from a build whose card model this version does not recognise, the run warns and
writes the card art without stats.

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
- `src/game-paths.ts`: Steam install folders per OS, and the game's `sts2.dll` beside the pack.
- `src/dotnet/`: a bounded ECMA-335 reader (PE sections, metadata tables and heaps, signatures,
  method bodies and IL). The assembly is untrusted: every index, offset and length is checked and
  anything malformed is a `DotnetError`.
- `src/card-stats.ts`: card facts from the game's code by type and member name (never by token),
  with a small symbolic evaluator for the straight-line IL patterns cards use.
- `src/card-text.ts`: the subset of SmartFormat the English card templates use (`{Var}`,
  `diff()`, `inverseDiff()`, `plural`, `show`, `cond`, `choose`, implicit conditionals,
  `energyIcons`, `starIcons`, nesting).
- `src/manifest.ts`: a copy of the resolver's `SpireManifest` type; a test fails if they differ.

## Development

```sh
bun run --cwd packages/cli test        # vitest
bun run --cwd packages/cli typecheck   # tsc -p packages/cli
bun run --cwd packages/cli build       # tsup -> dist/
```

Test fixtures are generated in the tests from tiny synthetic images and a synthetic .NET assembly
(`test/game-assembly.ts`); no game files are used. `test/real-game.test.ts` additionally checks a
few known cards against a local install when one is found (it is skipped in CI and elsewhere).

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
