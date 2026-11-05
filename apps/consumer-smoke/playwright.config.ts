import { defineConfig } from "@playwright/test";

// Driven by scripts/smoke.mjs, which builds the consumer app and serves it, then sets SMOKE_APP_URL.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: process.env.SMOKE_APP_URL, browserName: "chromium" },
});
