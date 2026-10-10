import { describe, expect, it } from "vitest";
import { fuse } from "../shared/fusion/roll";
import { FusionText, FuseRequest } from "../shared/fusion/schema";
import { STARTERS, makeCard } from "../shared/data/cards";
import { ABILITIES } from "../shared/data/abilities";
import { DEFAULT_TUNING } from "../shared/tuning";
import { mulberry32 } from "../shared/rng";

describe("fusion roll", () => {
  it("keeps abilities inside their limits and stats positive", () => {
    const T = { ...DEFAULT_TUNING, critChance: 100, mutMax: 80 };
    for (let i = 0; i < 500; i++) {
      const rng = mulberry32(i);
      let a = makeCard(STARTERS[i % 5]);
      for (let g = 0; g < 6; g++) a = fuse(a, makeCard(STARTERS[(i + g) % 5]), T, rng).child;
      const spec = ABILITIES[a.ab.type];
      expect(a.ab.v).toBeLessThanOrEqual(spec.max);
      expect(a.maxHp).toBeGreaterThan(0);
      expect(a.spd).toBeLessThanOrEqual(12);
      expect(a.name.length).toBeLessThanOrEqual(24);
    }
  });
  it("a botched fusion is clumsy", () => {
    const T = { ...DEFAULT_TUNING, critChance: 0, botchChance: 100 };
    const r = fuse(makeCard(STARTERS[0]), makeCard(STARTERS[1]), T, mulberry32(3));
    expect(r.outcome).toBe("botch");
    expect(r.child.ab.type).toBe("clumsy");
  });
});

describe("fusion text validation", () => {
  it("strips markup and control characters", () => {
    const t = FusionText.parse({ name: " <b>Zap\nrat</b> ", flavor: "Fine." });
    expect(t.name).toBe("Zap rat");
  });
  it("rejects names that are too long or empty", () => {
    expect(FusionText.safeParse({ name: "x".repeat(30), flavor: "ok" }).success).toBe(false);
    expect(FusionText.safeParse({ name: "", flavor: "ok" }).success).toBe(false);
  });
  it("rejects unknown elements in a request", () => {
    const p = { name: "A", els: ["plasma"], flavor: "" };
    expect(FuseRequest.safeParse({ a: p, b: p, outcome: "normal" }).success).toBe(false);
  });
});
