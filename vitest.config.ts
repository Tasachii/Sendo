import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tax engine is a pure function — plain node env is enough, no DOM needed
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
