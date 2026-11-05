import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const sb = join(__dirname, "..", "apps/storybook");

/** Guards the Tailwind pipeline: classes used only in registry/spire and theme vars must survive into built CSS. */
describe("storybook css", () => {
  it("contains utilities from registry components and every theme token", async () => {
    const req = createRequire(join(sb, "package.json"));
    const { build } = await import(pathToFileURL(req.resolve("vite")).href);
    const tailwind = (await import(pathToFileURL(req.resolve("@tailwindcss/vite")).href)).default;
    const out: any = await build({
      root: sb, configFile: false, logLevel: "silent", plugins: [tailwind()],
      build: { write: false, rollupOptions: { input: join(sb, "src/storybook.css") } },
    });
    const css = (Array.isArray(out) ? out : [out]).flatMap((o: any) => o.output).map((a: any) => a.source ?? "").join("\n");
    for (const needle of [".sr-only", "--color-class-silent", "--color-spire-hp", ".text-spire-hp"]) {
      expect(css, needle).toContain(needle);
    }
  });
});
