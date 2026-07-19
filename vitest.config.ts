import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/.claude/worktrees/**"],
    // node-cron ships as a real ESM module. Vitest externalizes node_modules
    // by default, which gives tests a native, immutable module namespace
    // object that `vi.spyOn` cannot redefine ("Cannot redefine property").
    // Inlining it here forces Vite to transform the module instead, which
    // produces a mutable namespace object so lib/scheduler/cron.test.ts can
    // spy on `nodeCron.schedule`.
    server: {
      deps: {
        inline: ["node-cron"],
      },
    },
  },
});

