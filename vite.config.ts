import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Strict CSP for the built app only; the dev server needs inline scripts for React Fast Refresh. */
const csp = (): Plugin => ({
  name: "csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      },
      injectTo: "head-prepend",
    },
  ],
});

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react(), csp()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
