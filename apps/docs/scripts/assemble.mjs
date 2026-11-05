// Finishes the Pages artifact after `vite build`:
//  - (the per-route HTML, 404.html, sitemap and robots.txt are written by scripts/prerender.mjs before this.)
//  - storybook/: the Storybook static build, published under /spire-ui/storybook/.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const storybook = join(here, "..", "..", "storybook", "storybook-static");

if (!existsSync(join(storybook, "index.html"))) {
  console.error(`Missing ${storybook}. Run "bun run storybook:build" first.`);
  process.exit(1);
}
cpSync(storybook, join(dist, "storybook"), { recursive: true });
console.log("assembled dist: storybook/");
