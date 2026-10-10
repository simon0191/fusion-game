import { z } from "zod";
import { STYLE } from "./style.js";
import { DEMO_GEMINI_KEY } from "./demo-key.js";

export const geminiKey = () => process.env.GEMINI_API_KEY || DEMO_GEMINI_KEY;

/**
 * Fused monster art from the Gemini API (Nano Banana 2 Lite, about 5-6 s per image in X-016).
 * The client sends both parents' pictures (small WebP data URLs); the server stores nothing, so this works
 * on Vercel too. The client cuts the white ground out of the result and keeps it on the card.
 */
export const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

const dataUrl = z.string().max(600_000).regex(/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/);
const parent = z.object({ name: z.string().min(1).max(40), image: dataUrl });
export const FuseImageRequest = z.object({
  a: parent,
  b: parent,
  ancestry: z.record(z.string().max(40), z.number().min(0).max(100)),
  els: z.array(z.string().max(12)).min(1).max(2),
});
export type FuseImageRequest = z.infer<typeof FuseImageRequest>;

function prompt(req: FuseImageRequest) {
  const words = ["mostly", "with clear features of", "with a slight hint of"];
  const anc = Object.entries(req.ancestry).sort((x, y) => y[1] - x[1])
    .map(([k, p], i) => `${words[Math.min(i, 2)]} ${k} (${p}%)`).join(", ");
  return `Fuse the two creatures in image 1 (${req.a.name}) and image 2 (${req.b.name}) into ONE new creature. ` +
    `Its ancestry is ${anc}: the share of each ancestor sets how much of it shows. Element${req.els.length > 1 ? "s" : ""}: ${req.els.join(" and ")}. ` +
    `Draw it in exactly the same art style as images 1 and 2. Single creature, full body, centred.\n\n${STYLE}`;
}

const part = (url: string) => {
  const [head, data] = url.split(",");
  return { inline_data: { mime_type: head.slice(5, head.indexOf(";")), data } };
};

export async function generateFusionImage(req: FuseImageRequest): Promise<{ image: string; seconds: number; model: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{ parts: [part(req.a.image), part(req.b.image), { text: prompt(req) }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[] };
  const img = body.candidates?.flatMap(c => c.content?.parts ?? []).find(p => p.inlineData)?.inlineData;
  if (!img) return null;
  return { image: `data:${img.mimeType ?? "image/png"};base64,${img.data}`, seconds: Math.round((Date.now() - started) / 100) / 10, model: MODEL };
}
