import { Hono } from "hono";
import { FuseRequest, FusionText } from "../shared/fusion/schema.js";
import { generateFusionText } from "./ai/text.js";
import { FuseImageRequest, generateFusionImage, geminiKey } from "./ai/image.js";

const app = new Hono().basePath("/api");

app.get("/health", c => c.json({ ok: true, ai: { text: false, image: Boolean(geminiKey()) } }));

app.post("/fuse", async c => {
  const body = await c.req.json().catch(() => null);
  const req = FuseRequest.safeParse(body);
  if (!req.success) return c.json({ error: "bad_request" }, 400);
  const raw = await generateFusionText(req.data);
  const text = FusionText.safeParse(raw);
  if (!text.success) return c.json({ error: "invalid_ai_output" }, 502);
  return c.json({ ...text.data, source: raw.source });
});

app.post("/fuse-image", async c => {
  const req = FuseImageRequest.safeParse(await c.req.json().catch(() => null));
  if (!req.success) return c.json({ error: "bad_request" }, 400);
  const img = await generateFusionImage(req.data);
  return img ? c.json(img) : c.json({ error: "no_image" }, 502);
});

export default app;
