import { defineConfig } from "vitest/config";

// Standalone vitest config so the root vite.config.ts (with the Cloudflare
// plugin, which does not run under vitest) is NOT loaded.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
