import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
    splitting: false,
    external: ["react", "react-dom", "@dooor-ai/auth-core", "@dooor-ai/auth-node"],
    banner: { js: '"use client";' },
  },
  {
    entry: { server: "src/server.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2022",
    splitting: false,
    external: ["react", "react-dom", "@dooor-ai/auth-core", "@dooor-ai/auth-node"],
  },
]);
