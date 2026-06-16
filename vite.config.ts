import { defineConfig } from "vite";

// Vite config tuned for Tauri: fixed dev port, no screen clearing so Rust logs
// remain visible, and a build target that matches the Tauri webview.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    sourcemap: true,
  },
});
