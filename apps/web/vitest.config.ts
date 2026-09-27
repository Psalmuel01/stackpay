import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)), "@stackpay/config": fileURLToPath(new URL("../../packages/config/src/index.js", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], maxWorkers: 1 },
});
