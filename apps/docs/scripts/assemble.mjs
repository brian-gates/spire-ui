// Finishes the Pages artifact after `vite build`:
//  - 404.html: GitHub Pages serves it for unknown paths, so a deep link such as /spire-ui/components/run-row
//    (a client route, not a file) still boots the app. It is a copy of index.html, which uses absolute /spire-ui/ URLs.
//  - storybook/: the Storybook static build, published under /spire-ui/storybook/.
import { cpSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const storybook = join(here, "..", "..", "storybook", "storybook-static");

copyFileSync(join(dist, "index.html"), join(dist, "404.html"));
if (!existsSync(join(storybook, "index.html"))) {
  console.error(`Missing ${storybook}. Run "bun run storybook:build" first.`);
  process.exit(1);
}
cpSync(storybook, join(dist, "storybook"), { recursive: true });
console.log("assembled dist: 404.html and storybook/");
