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
