import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules", "dist", ".git"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
