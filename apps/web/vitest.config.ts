import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-ts/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
