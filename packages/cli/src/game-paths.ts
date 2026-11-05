// Where Steam installs Slay the Spire 2, and finding the game's pack in a folder.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const PCK_NAME = "Slay the Spire 2.pck";
const GAME = "Slay the Spire 2";
/** Inside the macOS app bundle, where the pack and release_info.json live. */
const MAC_RESOURCES = ["SlayTheSpire2.app", "Contents", "Resources"];

type ReadText = (file: string) => string | null;

const readText: ReadText = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** Library folders listed in a Steam `libraryfolders.vdf` (KeyValues text). */
export function parseLibraryFolders(vdf: string): string[] {
  const out: string[] = [];
  for (const m of vdf.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) out.push(m[1]!.replace(/\\(.)/g, "$1"));
  return out;
}

/**
 * Folders that may hold the game's pack, most likely first: each Steam root's own library, then
 * the extra libraries its `steamapps/libraryfolders.vdf` lists.
 */
export function defaultGameDirs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, read: ReadText = readText): string[] {
  const p = platform === "win32" ? path.win32 : path.posix;
  const home = env.HOME || env.USERPROFILE || os.homedir();
  let roots: string[];
  let game: (library: string) => string;
  if (platform === "darwin") {
    roots = [p.join(home, "Library", "Application Support", "Steam")];
    game = (lib) => p.join(lib, "steamapps", "common", GAME, ...MAC_RESOURCES);
  } else if (platform === "win32") {
    roots = [p.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam")];
    game = (lib) => p.join(lib, "steamapps", "common", GAME);
  } else {
    roots = [p.join(home, ".steam", "steam"), p.join(home, ".local", "share", "Steam")];
    game = (lib) => p.join(lib, "steamapps", "common", GAME);
  }
  const libraries = [...roots];
  for (const root of roots) {
    const vdf = read(p.join(root, "steamapps", "libraryfolders.vdf"));
    if (vdf) libraries.push(...parseLibraryFolders(vdf));
  }
  const seen = new Set<string>();
  return libraries.map(game).filter((d) => !seen.has(d) && seen.add(d));
}

const isFile = (f: string) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

/**
 * The game's pack given the folder that holds it, the macOS game folder (the pack is inside the
 * app bundle), or the pack file itself. Null if none is there.
 */
export function findPck(dirOrFile: string): string | null {
  if (dirOrFile.endsWith(".pck") && isFile(dirOrFile)) return dirOrFile;
  for (const candidate of [path.join(dirOrFile, PCK_NAME), path.join(dirOrFile, ...MAC_RESOURCES, PCK_NAME)]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/** The game's own code, a .NET assembly. */
export const ASSEMBLY_NAME = "sts2.dll";

/**
 * The game's sts2.dll beside its pack: Steam puts it in a `data_sts2_<platform>_<arch>` folder next
 * to the pack (one per architecture on macOS; their IL is the same). Null if none is there.
 */
export function findAssembly(pck: string): string | null {
  const dir = path.dirname(pck);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries.filter((e) => /^data_sts2_[A-Za-z0-9_]+$/.test(e)).sort()) {
    const candidate = path.join(dir, name, ASSEMBLY_NAME);
    if (isFile(candidate)) return candidate;
  }
  return null;
}
