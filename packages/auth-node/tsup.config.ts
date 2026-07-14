import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", express: "src/express.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  splitting: false,
  external: ["@dooor-ai/auth-core"],
});
