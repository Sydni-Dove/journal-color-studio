import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base so the built app works from any sub-path
// (e.g. hosted beside Journal Color Studio at /product-studio/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
