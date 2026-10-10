import { defineConfig } from "vite";

// PORT and API_PORT let several worktrees run the game side by side.
const port = Number(process.env.PORT) || 5180;
const apiPort = Number(process.env.API_PORT) || 8787;

export default defineConfig({
  root: "client",
  publicDir: "../public",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    port,
    strictPort: true,
    proxy: { "/api/": `http://localhost:${apiPort}` },
  },
});
