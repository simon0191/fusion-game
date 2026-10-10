import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  publicDir: "../public",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    proxy: { "/api/": "http://localhost:8787" },
  },
});
