import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/reset-db.ts"],
    // Tests share one real database and truncate it before each test,
    // so files must not run in parallel.
    fileParallelism: false,
    env: { NODE_ENV: "test" },
  },
});
