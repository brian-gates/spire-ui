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

  it("spire-theme ships spire.css as the single source of truth, with no colour or font cssVars", () => {
    const item = read("spire-theme");
    expect(item.cssVars?.theme ?? {}).toEqual({});
    expect(JSON.stringify(item.cssVars ?? {})).not.toMatch(/color-|font-|spire-/);
    expect(item.files.map((f: { path: string }) => f.path)).toEqual(["registry/spire/theme/spire.css"]);
    expect(item.files[0].content).toContain("--color-spire-gold");
  });

  it("builds spire-utils as a registry:lib containing cn", () => {
    const item = read("spire-utils");
    expect(item.type).toBe("registry:lib");
    expect(item.files[0].content).toContain("export function cn");
  });

  it("builds the combat stats components with the shared tones and the kind tokens", () => {
    expect(JSON.stringify(read("spire-theme"))).toMatch(/--color-spire-dealt[\s\S]*--color-spire-taken[\s\S]*--color-spire-saved[\s\S]*--color-spire-healed/);
    expect(read("spire-combat-tones").files[0].target).toBe("~/lib/spire/lib/combat-tones.ts");
    for (const name of ["stat-tile", "source-bar", "round-card", "log-row", "combat-log"]) {
      const item = read(`spire-${name}`);
      expect(item.files.map((f: { target: string }) => f.target), name).toEqual([`~/lib/spire/game/${name}.tsx`]);
      expect(item.registryDependencies, name).toContain("https://brian-gates.github.io/spire-ui/r/spire-combat-tones.json");
    }
    expect(read("spire-combat-log").registryDependencies).toEqual(expect.arrayContaining(["https://brian-gates.github.io/spire-ui/r/spire-round-card.json", "https://brian-gates.github.io/spire-ui/r/spire-log-row.json"]));
  });

  it("ships no game assets in any built item", () => {
    const bad = /game-examples|\.ctex|\.pck/;
    for (const f of readdirSync(out).filter((n) => n.endsWith(".json"))) {
      const item = read(f.replace(/\.json$/, ""));
      for (const file of item.files ?? []) expect(file.path).not.toMatch(bad);
    }
  });
});
