// Regenerates public/og.png, the one site-wide Open Graph image (1200x630). Run by hand when the look changes:
//   node scripts/make-og.mjs      (needs Playwright's chromium: bunx playwright install chromium)
// Original artwork only: type and a spire glyph. Never put game art in here.
import { chromium } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og.png");
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;background:radial-gradient(ellipse at 20% 10%,#16262d,#0a1115 70%);color:#e6ece9;
    font-family:Georgia,serif;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;border:12px solid #1c3039}
  h1{margin:0;font-size:132px;color:#f0c75e;letter-spacing:2px}
  p{margin:24px 0 0;font-size:44px;line-height:1.3;max-width:900px;color:#b8c7c2}
  svg{position:absolute;right:96px;top:150px;width:260px;height:260px}
</style>
<svg viewBox="0 0 32 32"><path d="M16 4l9 24H7z" fill="none" stroke="#f0c75e" stroke-width="1.2" stroke-linejoin="round"/></svg>
<h1>Spire UI</h1>
<p>A dark slate-teal React and Tailwind component kit, distributed as a shadcn registry.</p>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
