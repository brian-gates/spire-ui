import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.{ts,tsx}", "registry/**/*.test.{ts,tsx}"], testTimeout: 60_000 },
});
