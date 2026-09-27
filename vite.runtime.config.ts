import { resolve } from "node:path";
import { defineConfig } from "vite";

// Production runtime for the Webflow site (see runtime/README.md).
// Emits dist-runtime/particles.js (tiny loader) + engine.js (Three.js +
// simulation, fetched on demand by the loader via a relative import, so the
// pair works from any CDN path).
export default defineConfig({
  base: "./",
  publicDir: resolve(__dirname, "runtime/public"),
  build: {
    outDir: "dist-runtime",
    emptyOutDir: true,
    target: "es2020",
    // no preload helper/polyfill: the dynamic import stays a plain import()
    modulePreload: false,
    // engine.js is mostly Three.js's WebGLRenderer (~138 kB gzip), loaded lazily
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: { particles: resolve(__dirname, "src/runtime/index.ts") },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
      },
    },
  },
});
