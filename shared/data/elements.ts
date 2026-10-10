import type { Element } from "../types.js";

export const ELEMENTS: Record<Element, { color: string; beats: Element[] }> = {
  fire: { color: "#f0612f", beats: ["leaf"] },
  water: { color: "#2f95f0", beats: ["fire", "rock"] },
  leaf: { color: "#3fae4f", beats: ["water", "rock"] },
  rock: { color: "#a8803f", beats: ["fire", "spark"] },
  spark: { color: "#e0b000", beats: ["water"] },
  shadow: { color: "#8a5cf0", beats: ["spark", "leaf"] },
};

/** Best multiplier any attacking element gets against the defender's main element. */
export function elementMultiplier(atkEls: Element[], defEls: Element[]): number {
  const d = defEls[0];
  let best = 0;
  for (const a of atkEls) {
    let m = 1;
    if (ELEMENTS[a].beats.includes(d)) m = 1.5;
    else if (ELEMENTS[d].beats.includes(a)) m = 0.75;
    best = Math.max(best, m);
  }
  return best;
}
