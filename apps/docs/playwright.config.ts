import { defineConfig } from "@playwright/test";

// Run `bun run build` (registry, storybook and docs) first: the tests exercise the static output through scripts/serve-static.mjs, which has no SPA fallback (like GitHub Pages).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4174", browserName: "chromium" },
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: "http://localhost:4174/spire-ui/",
    // Never reuse: a `vite preview` on another port or a stale server would bring back the SPA fallback.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
