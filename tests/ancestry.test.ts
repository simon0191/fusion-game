import { describe, expect, it } from "vitest";
import { ancestryOf, crossAncestry } from "../shared/fusion/ancestry.js";
import { fuse } from "../shared/fusion/roll.js";
import { MONSTERS, makeCard } from "../shared/data/cards.js";

const ALL = Object.values(MONSTERS);
import { DEFAULT_TUNING as T } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";
import type { Card } from "../shared/types.js";

const card = (name: string, ancestry?: Record<string, number>): Card => ({ ...makeCard(ALL[0]), name, ancestry });

describe("fusion ancestry", () => {
  it("a base card is 100% itself, also for saves without ancestry", () => {
    expect(ancestryOf(makeCard(ALL[0]))).toEqual({ [ALL[0].name]: 100 });
  });
  it("two base cards give 50/50", () => {
    expect(crossAncestry(card("A"), card("B"), T)).toEqual({ A: 50, B: 50 });
  });
  it("old ancestors fade out under 20% and at most three stay (the X-016 level-3 lineage)", () => {
    const l1a = card("L1a", crossAncestry(card("bull"), card("cat"), T));
    const l1b = card("L1b", crossAncestry(card("fox"), card("drake"), T));
    const l2 = card("L2", crossAncestry(l1a, card("axolotl"), T));
    expect(l2.ancestry).toEqual({ axolotl: 50, bull: 25, cat: 25 });
    const l3 = crossAncestry(l2, l1b, T);
    expect(Object.keys(l3).sort()).toEqual(["axolotl", "drake", "fox"]);
    expect(Object.values(l3).reduce((s, p) => s + p, 0)).toBe(100);
  });
  it("shares always add up to 100 with at most ancestryMax keys, however deep the chain", () => {
    const pool = ALL;
    for (let i = 0; i < 300; i++) {
      const rng = mulberry32(i);
      let a = makeCard(pool[i % pool.length]);
      for (let g = 0; g < 8; g++) {
        a = fuse(a, makeCard(pool[(i * 7 + g * 3) % pool.length]), T, rng).child;
        const shares = Object.values(a.ancestry!);
        expect(shares.reduce((s, p) => s + p, 0)).toBe(100);
        expect(shares.length).toBeLessThanOrEqual(T.ancestryMax);
        expect(Math.min(...shares)).toBeGreaterThan(0);
      }
    }
  });
});
