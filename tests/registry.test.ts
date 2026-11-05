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
