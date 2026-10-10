import { Hono } from "hono";
import { FuseRequest, FusionText } from "../shared/fusion/schema.js";
import { generateFusionText } from "./ai/text.js";

const app = new Hono().basePath("/api");

app.get("/health", c => c.json({ ok: true, ai: { text: false, image: false } }));

app.post("/fuse", async c => {
  const body = await c.req.json().catch(() => null);
  const req = FuseRequest.safeParse(body);
  if (!req.success) return c.json({ error: "bad_request" }, 400);
  const raw = await generateFusionText(req.data);
  const text = FusionText.safeParse(raw);
  if (!text.success) return c.json({ error: "invalid_ai_output" }, 502);
  return c.json({ ...text.data, source: raw.source });
});

export default app;
