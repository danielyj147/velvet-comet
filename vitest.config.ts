import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which roots at web/ for the viewer build).
export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
});
