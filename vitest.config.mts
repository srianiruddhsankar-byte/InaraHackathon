import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    // Several tests run the full 30-day wearable pipeline (seconds each); 5 s is too tight on a busy machine.
    testTimeout: 20_000,
  },
});
