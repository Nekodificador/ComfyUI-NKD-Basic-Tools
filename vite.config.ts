import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";

/**
 * Builds every Vue-based node widget in this pack into a single bundle,
 * js/nkd_vue_widgets.js (Prompt Variables, Gradient Map/Generate's color
 * ramp editor, ...). js/ also holds the hand-written nkd_basic_tools.js
 * extension, so the build must never wipe the directory (emptyOutDir: false).
 */
export default defineConfig({
  plugins: [vue(), cssInjectedByJs({ topExecutionPriority: false })],

  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },

  build: {
    lib: {
      entry: "./src/main.ts",
      formats: ["es"],
      fileName: "nkd_vue_widgets",
    },
    rollupOptions: {
      external: [
        "../../scripts/app.js",
        "../../scripts/api.js",
      ],
      output: {
        dir: "js",
        entryFileNames: "nkd_vue_widgets.js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    cssCodeSplit: false,
  },

  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
