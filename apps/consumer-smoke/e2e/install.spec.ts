import { expect, test } from "@playwright/test";

test("a freshly installed RunRow renders with fallback icons and no console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto("/");
  const row = page.locator("[data-slot=run-row]");
  await expect(row).toBeVisible();
  await expect(row.getByText("Act 2")).toBeVisible();
  await expect(row.getByText("Floor 21")).toBeVisible();
  await expect(row.locator("[data-slot=player-row]")).toHaveCount(2);
  await expect(row.getByText("Ayla")).toBeVisible();

  // No art is bundled: every icon is the built-in fallback glyph (inline SVG), never an <img>.
  await expect(row.locator("img")).toHaveCount(0);
  expect(await row.locator("svg").count()).toBeGreaterThan(2);

  // The theme was imported: the panel is painted with the Spire palette, not browser defaults.
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector("main")!).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");

  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});
