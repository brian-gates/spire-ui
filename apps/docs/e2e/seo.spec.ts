import { COMPONENT_SLUGS } from "../src/component-slugs";
import { expect, test } from "@playwright/test";

// The e2e server has no SPA fallback (like GitHub Pages), and these tests fetch raw HTML without running JS,
// so they prove what a crawler sees.
const SITE = "https://brian-gates.github.io/spire-ui/";
const COMPONENTS: readonly string[] = COMPONENT_SLUGS;
const H1: Record<string, string> = { "": "Spire UI", install: "Install", "extract-art": "Extract art", components: "Components" };
const ROUTES = ["", "install", "extract-art", "components", ...COMPONENTS.map((c) => `components/${c}`)];
const canonical = (path: string) => (path ? `${SITE}${path}/` : SITE);
const meta = (html: string, attr: "name" | "property", key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

test.describe("prerendered routes", () => {
  for (const path of ROUTES) {
    test(`/${path || "(home)"} is real HTML with a 200`, async ({ request }) => {
      const res = await request.get(`/spire-ui/${path}${path ? "/" : ""}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1].replace(/<[^>]+>/g, "");
      if (H1[path]) expect(h1).toBe(H1[path]);
      else expect(h1).toBeTruthy();
      expect(html).toContain(`<link rel="canonical" href="${canonical(path)}"`);
      expect(meta(html, "property", "og:title")).toBeTruthy();
      expect(meta(html, "property", "og:title")).toBe(html.match(/<title>(.*?)<\/title>/)?.[1]);
      expect(meta(html, "property", "og:url")).toBe(canonical(path));
      expect(meta(html, "name", "description")?.length).toBeGreaterThan(40);
      expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
      expect(meta(html, "property", "og:image")).toBe(`${SITE}og.png`);
      expect(html).not.toContain("game-examples/og");
    });
  }

  test("component pages carry their content in the raw HTML", async ({ request }) => {
    const html = await (await request.get("/spire-ui/components/run-row/")).text();
    expect(html).toContain("npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-run-row.json");
    expect(html).toContain("<h2");
    expect(html).toContain("Usage");
  });

  test("titles are distinct per page", async ({ request }) => {
    const titles = new Set<string>();
    for (const path of ROUTES) {
      const html = await (await request.get(`/spire-ui/${path}${path ? "/" : ""}`)).text();
      titles.add(html.match(/<title>(.*?)<\/title>/)![1]);
    }
    expect(titles.size).toBe(ROUTES.length);
  });

  test("the og image is served and is a PNG", async ({ request }) => {
    const res = await request.get("/spire-ui/og.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });
});

test.describe("crawler files", () => {
  test("sitemap.xml lists every route and nothing else", async ({ request }) => {
    const res = await request.get("/spire-ui/sitemap.xml");
    expect(res.status()).toBe(200);
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(ROUTES.map(canonical).sort());
  });

  test("robots.txt allows all and references the sitemap", async ({ request }) => {
    const res = await request.get("/spire-ui/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain(`Sitemap: ${SITE}sitemap.xml`);
  });
});

test.describe("unknown paths", () => {
  for (const path of ["nope", "components/nope", "install/extra"]) {
    test(`/${path} returns 404 with the Not Found page, noindex`, async ({ request, page }) => {
      const res = await request.get(`/spire-ui/${path}`);
      expect(res.status()).toBe(404);
      const html = await res.text();
      expect(html).toContain("Not found");
      expect(html).toContain('<meta name="robots" content="noindex"');
      expect(html).not.toContain("rel=\"canonical\"");
      await page.goto(`/spire-ui/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not found");
    });
  }
});

test("a prerendered page hydrates without console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  for (const path of ["", "components/run-row/", "components/dialog/", "install/"]) {
    await page.goto(`/spire-ui/${path}`);
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
});
