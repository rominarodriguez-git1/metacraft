import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate from vitest.config.ts (which only includes tests/unit and runs
 * under jsdom) because these tests hit real Postgres/SMTP over the node
 * environment. Run with `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
