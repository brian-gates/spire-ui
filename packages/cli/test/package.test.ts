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
  test("bundles keep bcdec's licence notice wherever the ported decoder ends up", () => {
    // The package's own tsup config, with the decoder's consumer added as an entry: the bin stub
    // does not import it yet, and a bundle that does must carry the notice.
    execFileSync(path.join(pkg, "node_modules/.bin/tsup"), ["src/index.ts", "src/ctex.ts", "--out-dir", out], { cwd: pkg, stdio: "pipe" });
    const ported = "[0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]"; // BC7 4-bit weights
    const ctex = fs.readFileSync(path.join(out, "ctex.js"), "utf8");
    expect(ctex).toContain(ported);
    for (const file of fs.readdirSync(out).filter((f) => f.endsWith(".js"))) {
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
