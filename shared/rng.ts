import type { Rng } from "./types.js";

/** Seeded generator for tests and the balance simulator. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
export const pickOne = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

let counter = 0;
export const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
