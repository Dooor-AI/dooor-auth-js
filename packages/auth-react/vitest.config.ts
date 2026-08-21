import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-side modules default to node; client tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
