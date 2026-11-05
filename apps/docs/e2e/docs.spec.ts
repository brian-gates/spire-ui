import { COMPONENT_SLUGS } from "../src/component-slugs";
import { expect, test, type Page } from "@playwright/test";

const COMPONENTS: readonly string[] = COMPONENT_SLUGS;
const PAGES = ["", "install", "extract-art", ...COMPONENTS.map((c) => `components/${c}`)];
const FOOTER = "Unofficial fan project, not affiliated with Mega Crit.";

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return problems;
}

test.describe("pages", () => {
  for (const path of PAGES) {
    test(`/${path || "(home)"} loads cleanly with the footer`, async ({ page }) => {
      const problems = watchConsole(page);
      await page.goto(`/spire-ui/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toHaveText(FOOTER);
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });

    test(`/${path || "(home)"} does not overflow at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/spire-ui/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    });
  }

  test("an unknown route says so instead of rendering blank", async ({ page }) => {
    await page.goto("/spire-ui/components/nope");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not found");
  });
});

test.describe("component previews", () => {
  for (const slug of COMPONENTS) {
    test(`${slug} shows both previews`, async ({ page }) => {
      await page.goto(`/spire-ui/components/${slug}`);
      const plain = page.getByTestId("preview-default");
      const art = page.getByTestId("preview-art");
      await expect(page.getByRole("heading", { name: "Out of the box" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "With your game's art" })).toBeVisible();
      await expect(plain).toBeVisible();
      await expect(art).toBeVisible();
      await expect(plain.locator("img[src*='game-examples']")).toHaveCount(0);
    });
  }

  test("the art preview loads the curated examples, the default one never does", async ({ page }) => {
    await page.goto("/spire-ui/components/run-row");
    const art = page.getByTestId("preview-art");
    await expect(art.locator("img[src*='/spire-ui/game-examples/']").first()).toBeVisible();
    await expect
      .poll(() => art.locator("img[src*='game-examples']").evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0)))
      .toBe(true);
    await expect(page.getByTestId("preview-default").locator("img")).toHaveCount(0);
  });

  test("each component page shows its install command", async ({ page }) => {
    await page.goto("/spire-ui/components/run-row");
    await expect(page.getByText("npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-run-row.json")).toBeVisible();
  });
});

test.describe("registry and storybook", () => {
  test("the registry item for run-row is served and parses", async ({ request }) => {
    const res = await request.get("/spire-ui/r/spire-run-row.json");
    expect(res.ok()).toBe(true);
    const item = await res.json();
    expect(item.name).toBe("spire-run-row");
    expect(item.files.length).toBeGreaterThan(0);
  });

  test("the registry index lists every component", async ({ request }) => {
    const index = await (await request.get("/spire-ui/r/registry.json")).json();
    const names: string[] = index.items.map((i: { name: string }) => i.name);
    for (const slug of COMPONENTS) expect(names, slug).toContain(`spire-${slug}`);
  });

  test("the game examples manifest is served and nothing in the registry output references it", async ({ request }) => {
    const m = await (await request.get("/spire-ui/game-examples/manifest.json")).json();
    expect(m.generator).toBe("spire-ui");
    expect(Object.keys(m.items).length).toBeLessThanOrEqual(40);
    const run = await (await request.get("/spire-ui/r/spire-run-row.json")).text();
    expect(run).not.toContain("game-examples");
  });

  test("the nav links Storybook and it loads under the subpath", async ({ page }) => {
    await page.goto("/spire-ui/");
    const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Storybook" });
    await expect(link).toHaveAttribute("href", "/spire-ui/storybook/");
    await link.click();
    await expect(page).toHaveURL(/\/spire-ui\/storybook\/$/);
    await expect(page).toHaveTitle(/Storybook/);
    const frame = await page.request.get("/spire-ui/storybook/iframe.html");
    expect(frame.ok()).toBe(true);
  });

  test("a deep link to a component page survives a reload (served as its own prerendered file)", async ({ page }) => {
    await page.goto("/spire-ui/components/run-row");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("RunRow");
  });
});

// Chrome 156+ returns a Promise from window.scrollTo. An effect that returned it handed React a
// non-function "cleanup", which crashed the app on the next client-side navigation (blank page).
// Stub the newer behaviour so this is caught whatever Chromium version Playwright ships.
test("client-side navigation works when window.scrollTo returns a Promise", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    // Newer Chrome returns a Promise here; the DOM typings still say void, hence the cast.
    window.scrollTo = ((x: number, y: number) => {
      original(x, y);
      return Promise.resolve();
    }) as unknown as typeof window.scrollTo;
  });
  const problems = watchConsole(page);
  await page.goto("/spire-ui/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const name of ["Install", "Extract art", "Components"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(problems).toEqual([]);
});
