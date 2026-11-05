import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseManifest } from "../../../registry/spire/lib/assets";
import { defaultGameDirs, findPck, parseLibraryFolders } from "../src/game-paths";
import { buildPck, fakeSfnt, importFile, pngCtex, solidPng } from "./fixtures";

const pkg = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spire-cli-"));
// Inside the package so the bundle resolves its runtime dependencies (sharp, fzstd) as installed.
const dist = fs.mkdtempSync(path.join(pkg, "node_modules", ".spire-cli-test-"));
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(dist, { recursive: true, force: true });
});

// The CLI is tested as published: built by tsup and run with node.
beforeAll(() => {
  execFileSync(path.join(pkg, "node_modules/.bin/tsup"), ["--out-dir", dist], { cwd: pkg, stdio: "pipe" });
});

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [path.join(dist, "index.js"), ...args], { cwd: tmp, encoding: "utf8", env: { ...process.env, HOME: path.join(tmp, "nohome") } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

async function fakeGame(name: string): Promise<string> {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  const png = await solidPng(20, 20, [9, 9, 9]);
  fs.writeFileSync(
    path.join(dir, "Slay the Spire 2.pck"),
    buildPck({
      files: [
        { path: "images/relics/anchor.png.import", data: importFile(".godot/imported/anchor.ctex") },
        { path: ".godot/imported/anchor.ctex", data: pngCtex(png, 20, 20) },
        { path: "fonts/kreon_bold.ttf.import", data: Buffer.from('[remap]\npath="res://.godot/imported/kreon.fontdata"\n') },
        { path: ".godot/imported/kreon.fontdata", data: Buffer.concat([Buffer.from("RSRC"), fakeSfnt()]) },
      ],
    }),
  );
  return dir;
}

describe("spire-ui extract-art", () => {
  test("an empty --game-dir prints one line, exits 2 and creates nothing", () => {
    const empty = path.join(tmp, "empty");
    fs.mkdirSync(empty);
    const out = path.join(tmp, "out-empty");
    const r = run("extract-art", "--game-dir", empty, "--out", out);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^spire-ui: game not found/);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(fs.existsSync(out)).toBe(false);
  });

  test("no install in the default places prints one line and exits 2", () => {
    const out = path.join(tmp, "out-default");
    const r = run("extract-art", "--out", out);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^spire-ui: game not found.*--game-dir/);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(fs.existsSync(out)).toBe(false);
  });

  test("a file that is not a pack is a user error", () => {
    const bad = path.join(tmp, "bad");
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, "Slay the Spire 2.pck"), "not a pack at all");
    const out = path.join(tmp, "out-bad");
    const r = run("extract-art", "--game-dir", bad, "--out", out);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^spire-ui: .*not a Godot PCK/);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(fs.existsSync(out)).toBe(false);
  });

  test("--out pointing at a web app's public folder is refused with one line and left untouched", async () => {
    const game = await fakeGame("game-webapp");
    const pub = path.join(tmp, "webapp-public");
    fs.mkdirSync(pub);
    const manifest = JSON.stringify({ short_name: "App", icons: [{ src: "favicon.ico" }] });
    fs.writeFileSync(path.join(pub, "manifest.json"), manifest);
    fs.writeFileSync(path.join(pub, "index.html"), "<p>mine</p>");
    const r = run("extract-art", "--game-dir", game, "--out", pub);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^spire-ui: refusing to replace /);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(fs.readdirSync(pub).sort()).toEqual(["index.html", "manifest.json"]);
    expect(fs.readFileSync(path.join(pub, "manifest.json"), "utf8")).toBe(manifest);
    expect(fs.readdirSync(tmp).filter((f) => f.startsWith("webapp-public."))).toEqual([]);
  });

  test("filesystem problems with --out are user errors without a stack trace", async () => {
    const game = await fakeGame("game-fs");
    const file = path.join(tmp, "a-file");
    fs.writeFileSync(file, "");
    const r = run("extract-art", "--game-dir", game, "--out", path.join(file, "spire"));
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^spire-ui: ENOTDIR/);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
  });

  test("bad options are user errors", () => {
    expect(run("extract-art", "--kinds", "relic,hats").code).toBe(2);
    expect(run("extract-art", "--sizes", "0").code).toBe(2);
    expect(run("extract-art", "--sizes", "64,abc").code).toBe(2);
    expect(run("extract-art", "--sizes", Array.from({ length: 17 }, (_, i) => i + 1).join(",")).code).toBe(2);
    expect(run("extract-art", "--nope").code).toBe(2);
    expect(run("dance").code).toBe(2);
  });

  test("--help prints usage and exits 0", () => {
    const r = run("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("spire-ui extract-art");
  });

  test("extracts into --out and prints a summary", async () => {
    const game = await fakeGame("game-ok");
    const out = path.join(tmp, "out-ok");
    const r = run("extract-art", "--game-dir", game, "--out", out, "--sizes", "16,8");
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/relic 1/);
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")))!;
    expect(manifest.gameVersion).toBe("unknown");
    expect(manifest.items["RELIC.ANCHOR"]).toMatchObject({ file: "relic/anchor@16.webp", w: 16, h: 16 });
    expect(fs.existsSync(path.join(out, "relic/anchor@8.webp"))).toBe(true);
  });

  test("--fonts prints the local-use notice", async () => {
    const game = await fakeGame("game-fonts");
    const r = run("extract-art", "--game-dir", game, "--out", path.join(tmp, "out-fonts"), "--fonts");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/game's fonts \(fonts\/kreon_bold\.ttf\).*local use only/);
    expect(r.stderr).toMatch(/^spire-ui: warning: font fonts\/spectral_bold\.ttf not found/);
  });

  test("the default --out is ./public/spire", async () => {
    const game = await fakeGame("game-default-out");
    const r = run("extract-art", "--game-dir", game);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(tmp, "public/spire/manifest.json"))).toBe(true);
  });
});

describe("game paths", () => {
  const MAC = "Slay the Spire 2/SlayTheSpire2.app/Contents/Resources";

  test("macOS: Steam's default library plus libraryfolders.vdf libraries", () => {
    const vdf = `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"/Users/me/Library/Application Support/Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"/Volumes/Games/SteamLibrary"\n\t}\n}\n`;
    const read = (p: string) => (p === "/Users/me/Library/Application Support/Steam/steamapps/libraryfolders.vdf" ? vdf : null);
    expect(defaultGameDirs("darwin", { HOME: "/Users/me" }, read)).toEqual([
      `/Users/me/Library/Application Support/Steam/steamapps/common/${MAC}`,
      `/Volumes/Games/SteamLibrary/steamapps/common/${MAC}`,
    ]);
  });

  test("Windows: Program Files (x86) Steam plus libraries, with escaped backslashes", () => {
    const vdf = `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t}\n}\n`;
    const read = (p: string) => (p === "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf" ? vdf : null);
    expect(defaultGameDirs("win32", {}, read)).toEqual([
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Slay the Spire 2",
      "D:\\SteamLibrary\\steamapps\\common\\Slay the Spire 2",
    ]);
    expect(defaultGameDirs("win32", { "ProgramFiles(x86)": "E:\\PF86" }, () => null)).toEqual(["E:\\PF86\\Steam\\steamapps\\common\\Slay the Spire 2"]);
  });

  test("Linux: ~/.steam/steam and ~/.local/share/Steam", () => {
    expect(defaultGameDirs("linux", { HOME: "/home/me" }, () => null)).toEqual([
      "/home/me/.steam/steam/steamapps/common/Slay the Spire 2",
      "/home/me/.local/share/Steam/steamapps/common/Slay the Spire 2",
    ]);
  });

  test("parseLibraryFolders reads every library path", () => {
    expect(parseLibraryFolders('"libraryfolders" { "0" { "path" "/a" "apps" { "1" "2" } } "1" { "path" "/b \\"q\\"" } }')).toEqual(["/a", '/b "q"']);
    expect(parseLibraryFolders("garbage")).toEqual([]);
  });

  test("findPck accepts the folder with the pack or the macOS game folder", () => {
    const dir = path.join(tmp, "find");
    const res = path.join(dir, "SlayTheSpire2.app/Contents/Resources");
    fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(res, "Slay the Spire 2.pck"), "");
    expect(findPck(res)).toBe(path.join(res, "Slay the Spire 2.pck"));
    expect(findPck(dir)).toBe(path.join(res, "Slay the Spire 2.pck"));
    expect(findPck(path.join(tmp, "does-not-exist"))).toBeNull();
    expect(findPck(path.join(res, "Slay the Spire 2.pck"))).toBe(path.join(res, "Slay the Spire 2.pck"));
  });
});
