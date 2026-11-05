// Wired up in Task 10: runs against the built docs (`vite preview`), see playwright.config.ts.
import { expect, test } from "@playwright/test";

test("RunRow with 40 relics stays inside 360px and keeps name and HP on one line", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/spire-ui/components/run-row");
  const row = page.locator("[data-slot=run-row]").filter({ has: page.getByRole("button", { name: /more relics/ }) }).first();
  await expect(row).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);

  const player = row.locator("[data-slot=player-row]").first();
  const name = await player.locator("[data-slot=player-name]").boundingBox();
  const hp = await player.getByRole("img", { name: /^HP:/ }).boundingBox();
  const loot = await player.locator("[data-slot=player-loot]").boundingBox();
  expect(Math.abs(name!.y - hp!.y)).toBeLessThanOrEqual(8);
  expect(name!.width).toBeGreaterThan(40);
  expect(loot!.y).toBeGreaterThan(hp!.y + hp!.height - 1);
});
