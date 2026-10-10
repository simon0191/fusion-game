import type { Card, Tuning } from "../types.js";

/** Share of each base monster in a card, in whole percent summing to 100. Keys are base card names. */
export type Ancestry = Record<string, number>;

/** A base card is 100% itself. Cards saved before ancestry existed fall back to the same. */
export function ancestryOf(c: Card): Ancestry {
  return c.ancestry && Object.keys(c.ancestry).length ? c.ancestry : { [c.name]: 100 };
}

/**
 * The child's ancestry: the mean of both parents. Ancestors under `ancestryMinPct` fade out and at most
 * `ancestryMax` stay, so a card never shows more than a few ancestors however deep the fusion goes.
 * Deterministic: ties keep the order the ancestors first appear in (parent a first).
 */
export function crossAncestry(a: Card, b: Card, T: Tuning): Ancestry {
  const mix = new Map<string, number>();
  for (const parent of [ancestryOf(a), ancestryOf(b)])
    for (const [k, p] of Object.entries(parent)) mix.set(k, (mix.get(k) ?? 0) + p / 2);
  let kept = [...mix].filter(([, p]) => p >= T.ancestryMinPct);
  if (!kept.length) kept = [...mix];
  kept = kept.map((e, i) => [e, i] as const).sort((x, y) => y[0][1] - x[0][1] || x[1] - y[1]).map(x => x[0]).slice(0, T.ancestryMax);
  return toPercent(kept);
}

/** Largest-remainder rounding, so the shares are whole numbers that add up to exactly 100. */
function toPercent(entries: [string, number][]): Ancestry {
  const total = entries.reduce((s, [, p]) => s + p, 0);
  const raw = entries.map(([k, p]) => ({ k, v: (100 * p) / total }));
  const out = raw.map(r => ({ k: r.k, v: Math.floor(r.v), rem: r.v - Math.floor(r.v) }));
  let left = 100 - out.reduce((s, r) => s + r.v, 0);
  for (const r of [...out].sort((x, y) => y.rem - x.rem)) if (left-- > 0) r.v++;
  return Object.fromEntries(out.map(r => [r.k, r.v]));
}

/** Ancestors ordered by share, for prompts and the card face. */
export function ancestryLine(anc: Ancestry): string {
  return Object.entries(anc).sort((x, y) => y[1] - x[1]).map(([k, p]) => `${k} ${p}%`).join(" · ");
}
