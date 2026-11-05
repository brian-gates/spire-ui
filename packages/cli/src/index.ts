// spire-ui CLI: `spire-ui extract-art` copies art from your own Slay the Spire 2 install into
// your project. Exit codes: 0 ok, 2 a problem with the input (no game, bad pack, bad options),
// 1 anything unexpected.
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { CtexError } from "./ctex";
import { activeStaging, DEFAULT_KINDS, DEFAULT_SIZES, extract, ExtractError, MAX_SIZE, MAX_SIZES } from "./extract";
import { defaultGameDirs, findPck, PCK_NAME } from "./game-paths";
import { ResourceError } from "./godot";
import { ASSET_KINDS, type AssetKind } from "./manifest";
import { PckError } from "./pck";

const USAGE = `usage: spire-ui extract-art [options]

Extracts icons (and optionally fonts) from your own Slay the Spire 2 install into a folder your
app serves, with a manifest.json for Spire UI's <SpireAssets>. Nothing is downloaded.

  --game-dir <dir>   folder with "${PCK_NAME}" (default: Steam's usual install folders)
  --out <dir>        output folder, replaced on each run (default: ./public/spire)
  --sizes <list>     icon box sizes in px for responsive srcset, e.g. 64,128,256,512; a size
                     that would upscale an icon is skipped (default: ${DEFAULT_SIZES.join(",")})
  --kinds <list>     any of ${ASSET_KINDS.join(",")} (default: ${DEFAULT_KINDS.join(",")});
                     card also reads card stats and text from the game's code (sts2.dll)
  --fonts            also copy the game's fonts (for local use only)
  -h, --help         show this help`;

class UsageError extends Error {}

function list(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseSizes(value: string): number[] {
  const sizes = list(value).map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
  if (sizes.length === 0 || sizes.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_SIZE)) throw new UsageError(`--sizes must be whole numbers from 1 to ${MAX_SIZE}, e.g. 32,64`);
  if (new Set(sizes).size > MAX_SIZES) throw new UsageError(`--sizes takes at most ${MAX_SIZES} different sizes`);
  return sizes;
}

function parseKinds(value: string): AssetKind[] {
  const kinds = list(value);
  const bad = kinds.filter((k) => !(ASSET_KINDS as readonly string[]).includes(k));
  if (kinds.length === 0 || bad.length) throw new UsageError(`unknown --kinds ${bad.join(",") || "(empty)"}; use any of ${ASSET_KINDS.join(",")}`);
  return kinds as AssetKind[];
}

function locatePck(gameDir: string | undefined): string {
  if (gameDir !== undefined) {
    const pck = findPck(path.resolve(gameDir));
    if (!pck) throw new ExtractError("game-not-found", `game not found in ${gameDir} (no "${PCK_NAME}")`);
    return pck;
  }
  for (const dir of defaultGameDirs(process.platform, process.env)) {
    const pck = findPck(dir);
    if (pck) return pck;
  }
  throw new ExtractError("game-not-found", `game not found in Steam's usual folders; pass --game-dir <folder with "${PCK_NAME}">`);
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "game-dir": { type: "string" },
        out: { type: "string", default: "./public/spire" },
        sizes: { type: "string", default: DEFAULT_SIZES.join(",") },
        kinds: { type: "string", default: DEFAULT_KINDS.join(",") },
        fonts: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1 || positionals[0] !== "extract-art") throw new UsageError(positionals.length ? `unknown command ${positionals.join(" ")}` : "missing command");
  const sizes = parseSizes(values.sizes);
  const kinds = parseKinds(values.kinds);
  const pck = locatePck(values["game-dir"]);
  const out = path.resolve(values.out);

  const started = Date.now();
  const s = await extract({ pck, out, sizes, kinds, fonts: values.fonts, warn: (m) => console.error(`spire-ui: warning: ${m}`) });
  const counts = kinds.map((k) => `${k} ${s.counts[k]}`).join(", ");
  const rel = path.relative(process.cwd(), out);
  const shown = rel === "" ? "." : rel.startsWith("..") ? out : rel;
  console.log(
    `spire-ui: extracted ${counts} at ${[...new Set(sizes)].sort((a, b) => a - b).join(",")}px from game ${s.gameVersion} into ${shown}; ` +
      `${s.unmapped.length} ids without art; ${s.files} files, ${mb(s.bytes)}, ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  if (s.cardStats) {
    const u = s.cardStats.withUnknown;
    console.log(
      `spire-ui: card stats for ${s.cardStats.cards} cards from the game's code` +
        (u.length ? `; ${u.length} with fields it could not read (${u.slice(0, 5).join(", ")}${u.length > 5 ? ", ..." : ""}), listed in each card's "unknown"` : ""),
    );
  }
  if (values.fonts) {
    console.log(
      s.fonts.length
        ? `spire-ui: copied the game's fonts (${s.fonts.join(", ")}) for local use only; do not commit or redistribute them`
        : "spire-ui: --fonts: no game's fonts found in this game version",
    );
  }
  return 0;
}

const FS_INPUT_ERRORS = new Set(["EACCES", "EPERM", "ENOSPC", "EROFS", "EEXIST", "ENOTDIR", "EISDIR"]);
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ");

process.once("SIGINT", () => {
  for (const dir of activeStaging) fs.rmSync(dir, { recursive: true, force: true });
  process.exit(130);
});

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    if (e instanceof UsageError) {
      console.error(`spire-ui: ${oneLine(e.message)} (see spire-ui --help)`);
      process.exitCode = 2;
    } else if (e instanceof ExtractError || e instanceof PckError || e instanceof CtexError || e instanceof ResourceError) {
      console.error(`spire-ui: ${oneLine(e.message)}`);
      process.exitCode = 2;
    } else if (FS_INPUT_ERRORS.has((e as NodeJS.ErrnoException)?.code ?? "")) {
      // Problems with the output location (permissions, full or read-only disk, a file in the way).
      console.error(`spire-ui: ${oneLine((e as Error).message)}`);
      process.exitCode = 2;
    } else {
      console.error(`spire-ui: unexpected error: ${oneLine(e instanceof Error ? (e.stack ?? e.message) : String(e))}`);
      process.exitCode = 1;
    }
  },
);
