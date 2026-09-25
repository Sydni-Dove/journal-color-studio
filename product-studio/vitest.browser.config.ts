import { defineConfig } from "vitest/config";

// Real-browser suite (Chromium via playwright-core). Run: npm run test:mobile
// Set CHROMIUM_PATH if playwright-core cannot locate a Chromium build.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/browser/**/*.browser.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
