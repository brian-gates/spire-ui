import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const pkg = path.resolve(import.meta.dirname, "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "spire-cli-dist-"));
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

const BCDEC_COPYRIGHT = "Copyright (c) 2022 Sergii Kudlai";

describe("published package", () => {
  test("prepublishOnly rebuilds dist so a publish never ships a stale bundle", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(manifest.scripts.prepublishOnly).toBe("npm run build && npm test");
  });

  test("bundles keep bcdec's licence notice wherever the ported decoder ends up", () => {
    // The package's own tsup config; the bin bundles the decoder through extract-art.
    execFileSync(path.join(pkg, "node_modules/.bin/tsup"), ["--out-dir", out], { cwd: pkg, stdio: "pipe" });
    const ported = "[0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]"; // BC7 4-bit weights
    const bundles = fs.readdirSync(out).filter((f) => f.endsWith(".js"));
    expect(fs.readFileSync(path.join(out, "index.js"), "utf8")).toContain(ported);
    for (const file of bundles) {
      const bundle = fs.readFileSync(path.join(out, file), "utf8");
      if (!bundle.includes(ported)) continue;
      expect(bundle, file).toContain(BCDEC_COPYRIGHT);
      expect(bundle, file).toContain("Permission is hereby granted, free of charge");
    }
  });

  test("the tarball ships THIRD_PARTY_NOTICES.md with bcdec's MIT text", () => {
    const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: pkg, encoding: "utf8" })) as [{ files: { path: string }[] }];
    expect(packed.files.map((f) => f.path)).toContain("THIRD_PARTY_NOTICES.md");
    const notices = fs.readFileSync(path.join(pkg, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain(BCDEC_COPYRIGHT);
    expect(notices).toContain("THE SOFTWARE IS PROVIDED \"AS IS\"");
  });
});
