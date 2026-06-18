import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node so file-reading source tests keep a file:// import.meta.url.
    // DOM-dependent tests opt in per-file via `// @vitest-environment happy-dom`.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-ts/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
