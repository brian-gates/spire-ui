// Turns the client build into static HTML per route, after `vite build` and `vite build --ssr`:
//  - dist/<route>/index.html for every docs route (home is dist/index.html), with the rendered app inside
//    #root plus per-page title, description, canonical, Open Graph and Twitter tags.
//  - dist/404.html: a real Not Found page for genuinely unknown paths (marked noindex, rendered client-side).
//  - dist/sitemap.xml and dist/robots.txt.
// GitHub Pages serves dist/<route>/index.html with a 200, so crawlers see content without running JS.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const ssrDir = join(here, "..", "dist-ssr");

const { render, ROUTES, SITE, SITE_NAME, absoluteUrl } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const OG_IMAGE = `${SITE}og.png`;

const template = readFileSync(join(dist, "index.html"), "utf8");
if (!template.includes('<div id="root"></div>')) throw new Error("index.html template has no empty #root");

function head({ title, description, url, noindex }) {
  const t = esc(title);
  const d = esc(description);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    noindex ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${url}" />`,
    `<link rel="sitemap" type="application/xml" href="${SITE}sitemap.xml" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Spire UI: a dark slate-teal component kit" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ].join("\n    ");
}

// Replacement callbacks, not strings: rendered HTML can contain "$&" and friends.
function page(meta, body, rootAttrs = "") {
  return template
    .replace(/<title>[^<]*<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("</head>", () => `  ${head(meta)}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root"${rootAttrs}>${body}</div>`);
}

for (const route of ROUTES) {
  const url = absoluteUrl(route.path);
  const file = join(dist, route.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page({ ...route, url }, render(route.path)));
}

// The unknown-path page. Rendered at a path no route matches; the client re-renders it for the real URL.
writeFileSync(
  join(dist, "404.html"),
  page(
    { title: `Not found | ${SITE_NAME}`, description: "There is nothing at this address.", url: SITE, noindex: true },
    render("404"),
    " data-client-render",
  ),
);

const urls = ROUTES.map((r) => `  <url><loc>${absoluteUrl(r.path)}</loc></url>`).join("\n");
writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
// GitHub Pages project sites cannot serve the domain-root /robots.txt, so crawlers mostly ignore this one;
// the sitemap is discovered through the <link rel="sitemap"> in each page and Search Console submission.
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerendered ${ROUTES.length} routes, 404.html, sitemap.xml, robots.txt`);
