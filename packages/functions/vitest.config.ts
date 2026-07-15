import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { TABLE_NAME: "test-table" },
  },
});
