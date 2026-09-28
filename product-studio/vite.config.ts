import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base so the built app works from any sub-path
// (e.g. hosted beside Journal Color Studio at /product-studio/).
// Which build this is (the commit on Vercel), shown on the home page so a stale tab is easy to spot.
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";

export default defineConfig({
  base: "./",
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
