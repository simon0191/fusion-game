import type { Matrix4 } from "three";
import { G, type Kit, type Layer, at, m4 } from "./kit.js";

export interface Palette {
  trunk: string; leaves: string[]; stone: string[]; moss: string; vine: string;
  caps: [cap: string, spot: string][]; stem: string; gill: string;
  crystal: string[]; flowers: string[]; tuft: string; plant: string[]; wood: string;
  /** Layer for mushroom gills and rune stones: "glow" makes them light up. */
  magic: Layer;
}

type Rng = () => number;
const pick = <T>(rng: Rng, list: T[]) => list[Math.floor(rng() * list.length)];

/** Round storybook tree: tapered trunk and a cluster of puffy leaf balls. Origin at the base. */
export function tree(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const h = 1.5 + rng() * 0.8;
  k.add(G.taper, P.trunk, at(B, m4(0, h / 2, 0, 0, [0.2, h, 0.2])));
  k.add(G.cone, P.trunk, at(B, m4(0, 0.2, 0, rng() * 6, [0.38, 0.45, 0.38])));
  const dark = pick(rng, P.leaves), light = P.leaves[P.leaves.length - 1];
  const puffs: [number, number, number, number][] = [[0, h + 0.6, 0, 1.2], [0.75, h + 0.25, 0.2, 0.8], [-0.65, h + 0.35, -0.25, 0.85], [0.05, h + 1.35, -0.1, 0.78], [-0.2, h + 0.2, 0.7, 0.75]];
  puffs.forEach(([x, y, z, s], i) => k.add(G.blob, i === 3 ? light : dark, at(B, m4(x, y, z, rng() * 6, s * (0.9 + rng() * 0.2)))));
}

/** Giant spotted mushroom. The gill uses the palette's magic layer, so it glows in themes that want it. */
export function mushroom(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const [cap, spot] = pick(rng, P.caps), h = 1 + rng() * 0.3;
  k.add(G.taper, P.stem, at(B, m4(0, h / 2, 0, 0, [0.26, h, 0.26])));
  k.add(G.sphere, P.stem, at(B, m4(0, 0.12, 0, 0, [0.34, 0.2, 0.34])));
  k.add(G.dome, cap, at(B, m4(0, h - 0.06, 0, 0, [0.95, 0.6, 0.95])));
  k.add(G.cyl, P.gill, at(B, m4(0, h - 0.07, 0, 0, [0.9, 0.04, 0.9])), P.magic);
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, e = 0.3 + rng() * 1.0;
    const x = Math.sin(e) * Math.cos(a) * 0.95, y = Math.cos(e) * 0.6, z = Math.sin(e) * Math.sin(a) * 0.95;
    k.add(G.sphere, spot, at(B, m4(x * 0.96, h - 0.06 + y * 0.96, z * 0.96, 0, 0.09 + rng() * 0.06)));
  }
}

/** Crumbling stone arch spanning local x, with moss on top and vines hanging from the curve. Pillars sit at x = ±(w/2 + 0.35). */
export function arch(k: Kit, B: Matrix4, P: Palette, rng: Rng, w = 3.4) {
  const H = 2.3, R = w / 2 + 0.35;
  for (const side of [-1, 1]) {
    const x = side * R;
    k.add(G.box, P.stone[1], at(B, m4(x, 0.2, 0, 0, [0.95, 0.4, 0.95])));
    for (let j = 0; j < 3; j++) {
      k.add(G.box, P.stone[j % 2], at(B, m4(x + (rng() - 0.5) * 0.08, 0.4 + j * 0.64 + 0.32, 0, (rng() - 0.5) * 0.15, [0.72, 0.6, 0.72])));
    }
    k.add(G.blob, P.moss, at(B, m4(x, 0.42, 0.1, 0, [0.6, 0.16, 0.6])));
  }
  const n = 11, gap = rng() < 0.5 ? 2 + Math.floor(rng() * 7) : -1;
  for (let i = 0; i < n; i++) {
    if (i === gap) continue;
    const a = (i + 0.5) / n * Math.PI, c = Math.cos(a), sn = Math.sin(a);
    k.add(G.box, P.stone[i % 2], at(B, m4(c * R, H + sn * R, 0, 0, [0.66, 0.5, 0.7], 0, a + Math.PI / 2)));
    if (rng() < 0.45) k.add(G.blob, P.moss, at(B, m4(c * (R + 0.24), H + sn * (R + 0.24), 0, 0, [0.34, 0.1, 0.38], 0, a - Math.PI / 2)));
    if (i > 1 && i < n - 2 && rng() < 0.4) {
      const len = 0.4 + rng() * 0.9;
      k.add(G.cyl, P.vine, at(B, m4(c * (R - 0.27), H + sn * (R - 0.27) - len / 2, (rng() - 0.5) * 0.5, 0, [0.035, len, 0.035])));
    }
  }
}

/** Broken column with a fallen drum beside it. */
export function ruin(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const tiers = 1 + Math.floor(rng() * 3);
  k.add(G.box, P.stone[1], at(B, m4(0, 0.15, 0, rng(), [0.9, 0.3, 0.9])));
  for (let i = 0; i < tiers; i++) k.add(G.cyl, P.stone[i % 2], at(B, m4((rng() - 0.5) * 0.05, 0.3 + i * 0.7 + 0.35, 0, 0, [0.32, 0.68, 0.32])));
  const top = 0.3 + tiers * 0.7;
  k.add(G.cyl, P.stone[0], at(B, m4(0.05, top + 0.1, 0, 0, [0.3, 0.3, 0.3], 0.35, 0.2)));
  k.add(G.blob, P.moss, at(B, m4(0, top + 0.12, 0, 0, [0.34, 0.12, 0.34])));
  k.add(G.cyl, P.stone[0], at(B, m4(0.9, 0.3, 0.3, rng() * 3, [0.3, 0.7, 0.3], 0, Math.PI / 2)));
  k.add(G.blob, P.moss, at(B, m4(0.9, 0.55, 0.3, 0, [0.3, 0.1, 0.25])));
  if (P.magic === "glow" && rng() < 0.7) k.add(G.box, P.crystal[0], at(B, m4(0, 0.75, 0.33, 0, [0.16, 0.22, 0.02])), "glow");
}

/** A cluster of hexagonal crystals tilting outwards. Returns the local height of its glow centre. */
export function crystals(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const color = pick(rng, P.crystal);
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const main = i === 0, a = (i / n) * Math.PI * 2 + rng();
    const s = main ? 0.5 : 0.22 + rng() * 0.22;
    k.add(G.crystal, color, at(B, m4(main ? 0 : Math.cos(a) * 0.3, -0.05, main ? 0 : Math.sin(a) * 0.3, a, [s * 0.7, s, s * 0.7], main ? 0 : Math.sin(a) * 0.5, main ? 0 : -Math.cos(a) * 0.5)), "glow");
  }
  k.add(G.rock, P.stone[1], at(B, m4(0, 0, 0, rng() * 3, [0.45, 0.2, 0.45])));
  return 0.5;
}

export function mossyRock(k: Kit, B: Matrix4, P: Palette, rng: Rng, r = 0.6) {
  k.add(G.rock, pick(rng, P.stone), at(B, m4(0, r * 0.35, 0, rng() * 6, [r, r * 0.75, r * 0.9], rng() * 0.3)));
  k.add(G.blob, P.moss, at(B, m4(r * 0.1, r * 0.7, 0, rng() * 6, [r * 0.75, r * 0.25, r * 0.7])));
}

/** Oversized leafy plant: broad leaves fanning out and up from a short stalk. */
export function bigPlant(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const n = 5 + Math.floor(rng() * 3), color = pick(rng, P.plant);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4, len = 0.8 + rng() * 0.5;
    k.add(G.sphere, i % 2 ? color : P.plant[0], at(B, m4(Math.sin(a) * len * 0.6, 0.3 + len * 0.25, Math.cos(a) * len * 0.6, a, [len * 0.38, 0.04, len], -0.55 - rng() * 0.3)));
  }
  k.add(G.cone, P.plant[0], at(B, m4(0, 0.35, 0, 0, [0.12, 0.7, 0.12])));
}

export function flowers(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  const n = 3 + Math.floor(rng() * 5), color = pick(rng, P.flowers);
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 1.2, z = (rng() - 0.5) * 1.2, h = 0.18 + rng() * 0.2;
    k.add(G.cyl, P.tuft, at(B, m4(x, h / 2, z, 0, [0.015, h, 0.015])));
    k.add(G.sphere, color, at(B, m4(x, h, z, 0, [0.09, 0.06, 0.09])), P.magic === "glow" && i % 3 === 0 ? "glow" : "lit");
  }
}

export function tuft(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  for (let i = 0; i < 4; i++) {
    const a = rng() * 6, h = 0.25 + rng() * 0.25;
    k.add(G.cone, P.tuft, at(B, m4(Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08, a, [0.05, h, 0.05], Math.sin(a) * 0.3, Math.cos(a) * 0.3)));
  }
}

/** Gently arched plank bridge along local x, `span` metres long. */
export function bridge(k: Kit, B: Matrix4, P: Palette, span: number, rise: number) {
  const n = Math.round(span / 0.42);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (t - 0.5) * span, y = rise * Math.sin(Math.PI * t) + 0.06;
    const slope = Math.atan(rise * Math.PI / span * Math.cos(Math.PI * t));
    k.add(G.box, i % 2 ? P.wood : P.trunk, at(B, m4(x, y, 0, 0, [0.38, 0.08, 1.9], 0, slope)));
  }
  for (const z of [-0.9, 0.9]) {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, x = (t - 0.5) * span, y = rise * Math.sin(Math.PI * t);
      k.add(G.cyl, P.trunk, at(B, m4(x, y + 0.35, z, 0, [0.06, 0.6, 0.06])));
    }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8, x = (t - 0.5) * span, y = rise * Math.sin(Math.PI * t) + 0.62;
      k.add(G.box, P.wood, at(B, m4(x, y, z, 0, [span / 8 + 0.05, 0.07, 0.07], 0, Math.atan(rise * Math.PI / span * Math.cos(Math.PI * t)))));
    }
  }
}

/** Round stone dais for the champion: a raised disc, a ring of rune stones and four broken posts. */
export function dais(k: Kit, B: Matrix4, P: Palette, rng: Rng) {
  k.add(G.cyl, P.stone[1], at(B, m4(0, 0.08, 0, 0, [2.75, 0.16, 2.75])));
  k.add(G.cyl, P.stone[0], at(B, m4(0, 0.2, 0, 0, [2.45, 0.2, 2.45])));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.add(G.box, i % 4 === 0 ? P.crystal[0] : P.stone[1], at(B, m4(Math.cos(a) * 1.95, 0.305, Math.sin(a) * 1.95, -a, [0.22, 0.02, 0.5])), i % 4 === 0 ? "glow" : "lit");
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, h = 0.7 + rng() * 0.9;
    k.add(G.box, P.stone[i % 2], at(B, m4(Math.cos(a) * 2.95, h / 2, Math.sin(a) * 2.95, a, [0.45, h, 0.45])));
    k.add(G.blob, P.moss, at(B, m4(Math.cos(a) * 2.95, h, Math.sin(a) * 2.95, 0, [0.3, 0.1, 0.3])));
  }
}
