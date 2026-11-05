import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const out = join(__dirname, "..", "apps/docs/public/r");
const read = (name: string) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

describe("registry build", () => {
  beforeAll(() => {
    execSync("bun run registry:build", { cwd: join(__dirname, ".."), stdio: "pipe" });
  });

  it("builds spire-theme as a registry:theme with the gold token", () => {
    expect(existsSync(join(out, "spire-theme.json"))).toBe(true);
    const item = read("spire-theme");
    expect(item.type).toBe("registry:theme");
    expect(JSON.stringify(item)).toContain("--color-spire-gold");
  });

  it("theme cssVars carry each spire.css token exactly once and no doubled color- prefix", () => {
    const item = read("spire-theme");
    const css = readFileSync(join(__dirname, "..", "registry/spire/theme/spire.css"), "utf8");
    const block = /@theme static \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const tokens = [...block.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(20);
    expect(JSON.stringify(item)).not.toContain("color-color");
    // shadcn prefixes colour keys with `color-` itself, so a colour token --color-x is declared as the key `x`.
    const keys = Object.keys(item.cssVars.theme as Record<string, string>);
    const expected = tokens.map((t) => t.replace(/^--color-/, "").replace(/^--/, ""));
    expect([...keys].sort()).toEqual([...expected].sort());
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of tokens.filter((t) => t.startsWith("--color-spire-"))) {
      expect(keys.filter((k) => k === t.slice("--color-".length)).length).toBe(1);
    }
  });

  it("builds spire-utils as a registry:lib containing cn", () => {
    const item = read("spire-utils");
    expect(item.type).toBe("registry:lib");
    expect(item.files[0].content).toContain("export function cn");
  });

  it("ships no game assets in any built item", () => {
    const bad = /game-examples|\.ctex|\.pck/;
    for (const f of readdirSync(out).filter((n) => n.endsWith(".json"))) {
      const item = read(f.replace(/\.json$/, ""));
      for (const file of item.files ?? []) expect(file.path).not.toMatch(bad);
    }
  });
});
