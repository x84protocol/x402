import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    middleware: "src/middleware.ts",
    client: "src/client.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "@x402/core",
    "@x402/express",
    "@x402/svm",
    "@solana-program/compute-budget",
    "@solana-program/token",
    "@solana-program/token-2022",
    "@solana/kit",
    "express",
  ],
});
