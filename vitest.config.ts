import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure unit tests run in Node. The `vscode` module is unavailable here, so
    // only `vscode`-free modules (e.g. src/schedule.ts) may be imported.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
