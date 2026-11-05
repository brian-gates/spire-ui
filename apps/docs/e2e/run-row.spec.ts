// Runs in Task 10 against the docs app. Excluded from tsc and vitest until @playwright/test is installed
// (tsconfig.json "exclude" and vitest include patterns do not match apps/docs/e2e).
import { expect, test } from "@playwright/test";

test("RunRow with 40 relics does not overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/spire-ui/components/run-row");
  await expect(page.getByText("Floor", { exact: false }).first()).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBe(360);
});
