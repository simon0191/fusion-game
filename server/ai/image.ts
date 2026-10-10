import { z } from "zod";
import { STYLE } from "./style.js";
import { MONSTERS } from "../../shared/data/cards.js";

const BASE_NAMES = new Set(Object.values(MONSTERS).map(m => m.name));
import { DEMO_GEMINI_KEY } from "./demo-key.js";

export const geminiKey = () => process.env.GEMINI_API_KEY || DEMO_GEMINI_KEY;

/**
 * Fused monster art from the Gemini API (Nano Banana 2 Lite, about 5-6 s per image in X-016).
 * The client sends both parents' pictures (small WebP data URLs); the server stores nothing, so this works
 * on Vercel too. The client cuts the white ground out of the result and keeps it on the card.
 */
export const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

const dataUrl = z.string().max(600_000).regex(/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/);
/** The client sends the base art of every ancestor in the child's ancestry (at most three). */
const ref = z.object({ name: z.string().refine(n => BASE_NAMES.has(n)), image: dataUrl });
export const FuseImageRequest = z.object({
  ancestry: z.record(z.string().max(40), z.number().min(0).max(100)),
  els: z.array(z.string().max(12)).min(1).max(2),
  refs: z.array(ref).min(1).max(3),
});
export type FuseImageRequest = z.infer<typeof FuseImageRequest>;

/**
 * DNA (scheme C of X-016): the reference images are the surviving ancestors, largest share first; the share of each
 * ancestor sets how much of it shows. Ancestors under the cut-off are already gone from the ancestry.
 */
export function dnaPrompt(ancestry: Record<string, number>, els: string[]) {
  const words = ["mostly", "with clear features of", "with a slight hint of"];
  const parts = Object.entries(ancestry).sort((x, y) => y[1] - x[1])
    .map(([k, p], i) => `${words[Math.min(i, 2)]} ${k} (${p}%, image ${i + 1})`);
  return `Draw ONE creature whose ancestry is ${parts.join(", ")}. The share of each ancestor sets how much of it shows; ` +
    `blend them into a single new creature rather than gluing parts together. Element${els.length > 1 ? "s" : ""}: ${els.join(" and ")}. ` +
    `The attached images are these ancestors in the same order; draw it in exactly their art style. Single creature, full body, centred.\n\n${STYLE}`;
}

const part = (url: string) => {
  const [head, data] = url.split(",");
  return { inline_data: { mime_type: head.slice(5, head.indexOf(";")), data } };
};

export async function generateFusionImage(req: FuseImageRequest): Promise<{ image: string; seconds: number; model: string } | null> {
  const key = geminiKey();
  const order = Object.entries(req.ancestry).sort((x, y) => y[1] - x[1]).map(([k]) => k);
  const byName = new Map(req.refs.map(r => [r.name, r.image]));
  if (!key || !order.length || order.some(n => !byName.has(n))) return null;
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{ parts: [...order.map(n => part(byName.get(n)!)), { text: dnaPrompt(req.ancestry, req.els) }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] } }[] };
  const img = body.candidates?.flatMap(c => c.content?.parts ?? []).find(p => p.inlineData)?.inlineData;
  if (!img) return null;
  return { image: `data:${img.mimeType ?? "image/png"};base64,${img.data}`, seconds: Math.round((Date.now() - started) / 100) / 10, model: MODEL };
}
