import { defineConfig } from "@playwright/test";

// Run `bun run build` (registry, storybook and docs) first: the tests exercise the static output via `vite preview`.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173", browserName: "chromium" },
  webServer: {
    command: "bun run preview",
    url: "http://localhost:4173/spire-ui/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
