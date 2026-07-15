import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // dynamo.ts reads TABLE_NAME at import time
    env: { TABLE_NAME: "test-table" },
  },
});
