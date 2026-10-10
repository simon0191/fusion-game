import { describe, expect, it } from "vitest";
import { elementMultiplier } from "../shared/data/elements";
import { STARTERS, OPPONENTS, makeCard } from "../shared/data/cards";
import { createBattle, enemyPick, choosePick, resolveAttack, finishTurn, attackOrder } from "../shared/battle/engine";
import { simulateBattle, SKILL } from "../shared/battle/bot";
import { DEFAULT_TUNING } from "../shared/tuning";
import { mulberry32 } from "../shared/rng";

const T = { ...DEFAULT_TUNING, alwaysWin: false };
const party = () => STARTERS.slice(0, 3).map(t => makeCard(t));

describe("elements", () => {
  it("water beats fire, fire is weak to water", () => {
    expect(elementMultiplier(["water"], ["fire"])).toBe(1.5);
    expect(elementMultiplier(["fire"], ["water"])).toBe(0.75);
    expect(elementMultiplier(["fire"], ["shadow"])).toBe(1);
  });
  it("a dual-element attacker uses its best element", () => {
    expect(elementMultiplier(["fire", "water"], ["rock"])).toBe(1.5);
  });
});

describe("timing taps", () => {
  const avgDamage = (from: "mine" | "theirs", timing: "perfect" | "good" | "miss") => {
    let total = 0;
    for (let i = 0; i < 300; i++) {
      const rng = mulberry32(i);
      const b = createBattle([makeCard({ ...STARTERS[2], ab: ["burn", 0] })], OPPONENTS[0]);
      b.myPick = b.mine[0].id;
      b.theirPick = b.theirs[0].id;
      const hit = resolveAttack(b, from, timing, T, rng).find(e => e.kind === "hit");
      if (hit && hit.kind === "hit" && !hit.selfHit) total += hit.dmg;
    }
    return total / 300;
  };
  it("a perfect tap hits harder than a miss", () => {
    expect(avgDamage("mine", "perfect")).toBeGreaterThan(avgDamage("mine", "miss") * 1.3);
  });
  it("a perfect block takes less damage than a miss", () => {
    expect(avgDamage("theirs", "perfect")).toBeLessThan(avgDamage("theirs", "miss") * 0.7);
  });
});

describe("battle flow", () => {
  it("always ends within the turn limit", () => {
    for (let i = 0; i < 200; i++) {
      const b = simulateBattle(party(), OPPONENTS[i % OPPONENTS.length], T, SKILL.casual, mulberry32(i));
      expect(b.over).toBe(true);
      expect(b.turn).toBeLessThanOrEqual(T.turnLimit);
    }
  });
  it("always win: enemies deal no damage and every hit knocks out", () => {
    const AW = { ...T, alwaysWin: true };
    const rng = mulberry32(1);
    const b = createBattle(party(), OPPONENTS[4]);
    enemyPick(b, rng);
    choosePick(b, b.mine[0].id);
    for (const side of attackOrder(b, rng)) resolveAttack(b, side, "miss", AW, rng);
    expect(b.mine.every(f => f.hp === f.maxHp || f.ab.type === "clumsy")).toBe(true);
    expect(b.theirs.find(f => f.id === b.theirPick)!.hp).toBe(0);
    finishTurn(b, AW);
    expect(b.over).toBe(false);
  });
  it("a knocked-out monster cannot be picked", () => {
    const b = createBattle(party(), OPPONENTS[0]);
    b.mine[0].hp = 0;
    expect(() => choosePick(b, b.mine[0].id)).toThrow();
  });
});
