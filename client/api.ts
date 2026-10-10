import type { Card, FusionOutcome } from "../shared/types.js";
import { FusionText } from "../shared/fusion/schema.js";
import { mockFusionText } from "../shared/fusion/mockText.js";

/**
 * Asks the server for the fused monster's name and flavor text. Falls back to the local mock
 * when the server is unreachable, slow, or returns something invalid.
 */
export async function fusionText(a: Card, b: Card, outcome: FusionOutcome): Promise<FusionText & { source: string }> {
  const parent = (c: Card) => ({ name: c.name, els: c.els, flavor: c.flavor });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch("/api/fuse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: parent(a), b: parent(b), outcome }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json();
      const parsed = FusionText.safeParse(body);
      if (parsed.success) return { ...parsed.data, source: String(body.source ?? "server") };
    }
  } catch { /* offline or timed out */ }
  return { ...mockFusionText(a, b, outcome), source: "local mock" };
}

/** A picture as a small WebP data URL (at most 384 px), to send as a fusion parent or keep on a card. */
async function small(src: string, cutWhite = false): Promise<string> {
  const im = new Image();
  im.src = src;
  await im.decode();
  const k = Math.min(1, 384 / Math.max(im.width, im.height));
  const w = Math.round(im.width * k), h = Math.round(im.height * k);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!; g.drawImage(im, 0, 0, w, h);
  if (cutWhite) {
    // Generated art comes on flat white: clear the near-white pixels connected to the border (white inside stays).
    const d = g.getImageData(0, 0, w, h), px = d.data, seen = new Uint8Array(w * h), stack: number[] = [];
    const near = (i: number) => px[i * 4] > 230 && px[i * 4 + 1] > 230 && px[i * 4 + 2] > 230;
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || !near(i)) continue;
      seen[i] = 1; px[i * 4 + 3] = 0;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
    g.putImageData(d, 0, 0);
  }
  return cv.toDataURL("image/webp", 0.9);
}

/** Asks the server to draw the fused monster from both parents' pictures. Null when there is no key, no art or the call fails. */
export async function fusionImage(child: Card, a: Card, b: Card): Promise<{ art: string; seconds: number; model: string } | null> {
  if (!a.art || !b.art) return null;
  try {
    const [ia, ib] = await Promise.all([small(a.art), small(b.art)]);
    const res = await fetch("/api/fuse-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: { name: a.name, image: ia }, b: { name: b.name, image: ib }, ancestry: child.ancestry ?? {}, els: child.els }),
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { image: string; seconds: number; model: string };
    return { art: await small(body.image, true), seconds: body.seconds, model: body.model };
  } catch { return null; }
}
