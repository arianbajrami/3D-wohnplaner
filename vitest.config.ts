import { defineConfig } from "vitest/config";

// Unit-Tests nur aus den Paketen; die Browser-Tests (apps/web/e2e) laufen über Playwright
export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
  },
});
