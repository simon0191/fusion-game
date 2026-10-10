import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  publicDir: "../public",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    proxy: { "/api": "http://localhost:8787" },
  },
});
