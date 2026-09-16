import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    globalSetup: ["test/global-setup.ts"],
    // Les tests partagent une base : les faire tourner en série.
    fileParallelism: false,
  },
})
