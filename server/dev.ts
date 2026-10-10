import { serve } from "@hono/node-server";
import app from "./app.js";

// Local keys (GEMINI_API_KEY) live in the ignored .env.local; on Vercel they come from the project settings.
try { process.loadEnvFile(".env.local"); } catch { /* no local env file */ }

const port = Number(process.env.API_PORT) || 8787;
serve({ fetch: app.fetch, port }, () => console.log(`API on http://localhost:${port}/api`));
