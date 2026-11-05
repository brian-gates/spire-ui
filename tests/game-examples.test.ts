import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const examples = join(root, "apps/docs/public/game-examples");
const ART_OR_FONT = /\.(webp|png|jpe?g|gif|svg|ttf|otf|woff2?|ctex|pck)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** The curated examples are docs-only: capped, fonts-free, documented, and unreachable from anything we ship. */
describe("game examples", () => {
  it("holds at most 40 images, no fonts, and every manifest item has its file", () => {
    const files = walk(examples).map((f) => relative(examples, f));
    const images = files.filter((f) => /\.webp$/.test(f));
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(40);
    expect(files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))).toEqual([]);
    expect(files.filter((f) => !/\.webp$/.test(f)).sort()).toEqual(["README.md", "manifest.json"]);

    const m = JSON.parse(readFileSync(join(examples, "manifest.json"), "utf8"));
    expect(m.schemaVersion).toBe(1);
    expect(m.generator).toBe("spire-ui");
    expect(m.fonts).toBeUndefined();
    const listed = Object.values<{ file: string }>(m.items).map((i) => i.file).sort();
    expect(listed).toEqual([...images].sort());
  });

  it("states its origin, purpose and that it is not part of the package or registry", () => {
    const readme = readFileSync(join(examples, "README.md"), "utf8");
    expect(readme).toMatch(/extracted from Slay the Spire 2 by Mega Crit/);
    expect(readme).toMatch(/illustrate the components/);
    expect(readme).toMatch(/not part of Spire UI/);
    expect(readme).toMatch(/not in the shadcn\s+registry, not in the `spire-ui` npm package/);
  });

  it("is not referenced by any registry item", () => {
    const registry = readFileSync(join(root, "registry.json"), "utf8");
    expect(registry).not.toMatch(/game-examples/);
    for (const f of walk(join(root, "registry"))) {
      expect(f, f).not.toMatch(ART_OR_FONT);
      expect(readFileSync(f, "utf8"), f).not.toMatch(/game-examples/);
    }
  });

  it("is not in the CLI npm package", () => {
    const out = execSync("npm pack --dry-run --json --ignore-scripts", { cwd: join(root, "packages/cli"), stdio: ["ignore", "pipe", "ignore"] }).toString();
    const paths: string[] = JSON.parse(out)[0].files.map((f: { path: string }) => f.path);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => /game-examples/.test(p) || ART_OR_FONT.test(p))).toEqual([]);
  });

  it("is the only place in the repository with images or fonts", () => {
    if (!existsSync(join(root, ".git"))) return;
    const files = execSync("git ls-files --cached --others --exclude-standard", { cwd: root }).toString().split("\n").filter(Boolean);
    const stray = files.filter((f) => ART_OR_FONT.test(f) && !f.startsWith("apps/docs/public/game-examples/"));
    expect(stray).toEqual([]);
  });
});
