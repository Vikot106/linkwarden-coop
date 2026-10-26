import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next.js preserves JSX for its own compiler; component tests need it transformed.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "apps/web"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
