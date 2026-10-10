import { describe, expect, it } from "vitest";
import { MONSTERS, OPPONENTS, makeCard } from "../shared/data/cards.js";
import { RUSH, RUSH_SKILL, active, createRush, simulateRush, step, type RushState } from "../shared/battle/protos/rush.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const T = { ...DEFAULT_TUNING, alwaysWin: false };
const party = () => ["gryffup", "rimescale", "lanternip"].map(k => makeCard(MONSTERS[k]));
/** Mossback with no ability, so passives do not blur the numbers. */
const plain = () => [makeCard({ ...MONSTERS.lanternip, ab: ["burn", 0] }), ...party().slice(1)];

/** Runs the clock with no input until `until` holds. */
function runUntil(s: RushState, until: (s: RushState) => boolean, rng = mulberry32(1), dt = 10) {
  for (let i = 0; i < 20_000 && !until(s) && !s.over; i++) step(s, dt, {}, T, rng);
}

describe("rush battles", () => {
  it("always end within the time limit", () => {
    for (let i = 0; i < 300; i++) {
      const skill = Object.values(RUSH_SKILL)[i % 3];
      const s = simulateRush(party(), OPPONENTS[i % OPPONENTS.length], T, skill, mulberry32(i));
      expect(s.over).toBe(true);
      expect(s.t).toBeLessThanOrEqual(RUSH.timeLimitMs + 20);
    }
  });

  it("always win: the player takes no damage and wins", () => {
    const AW = { ...T, alwaysWin: true };
    for (let i = 0; i < 50; i++) {
      const s = simulateRush(party(), OPPONENTS[4], AW, RUSH_SKILL.none, mulberry32(i));
      expect(s.result).toBe("win");
      expect(s.mine.team.every(f => f.hp === f.maxHp || f.ab.type === "clumsy")).toBe(true);
      expect(s.theirs.team.filter(f => f.hp <= 0).length).toBeGreaterThanOrEqual(T.kosToWin);
    }
  });

  it("a perfect block takes no damage and counters", () => {
    const s = createRush(plain(), OPPONENTS[0], mulberry32(1));
    runUntil(s, x => !!x.wind && x.wind.ms >= RUSH.windMs - 60);
    const me = active(s.mine), foe = active(s.theirs), foeHp = foe.hp;
    const ev = step(s, 10, { block: true }, T, mulberry32(2));
    expect(ev).toContainEqual({ kind: "block", grade: "perfect" });
    runUntil(s, x => !x.wind);
    expect(me.hp).toBe(me.maxHp);
    expect(foe.hp).toBeLessThan(foeHp);
  });

  it("an early block halves the damage", () => {
    const dmg = (blockEarly: boolean, seed: number) => {
      const s = createRush(plain(), OPPONENTS[0], mulberry32(1));
      runUntil(s, x => !!x.wind);
      if (blockEarly) step(s, 10, { block: true }, T, mulberry32(seed));
      const me = active(s.mine);
      runUntil(s, x => !x.wind, mulberry32(seed));
      return me.maxHp - me.hp;
    };
    let full = 0, half = 0;
    for (let i = 0; i < 50; i++) { full += dmg(false, i); half += dmg(true, i); }
    expect(half).toBeLessThan(full * 0.65);
    expect(half).toBeGreaterThan(0);
  });

  it("a whiffed block locks Block for a moment", () => {
    const s = createRush(plain(), OPPONENTS[0], mulberry32(1));
    expect(step(s, 10, { block: true }, T, mulberry32(1))).toContainEqual({ kind: "block", grade: "whiff" });
    expect(step(s, 10, { block: true }, T, mulberry32(1))).not.toContainEqual(expect.objectContaining({ kind: "block" }));
  });

  it("charging hits harder than a tap", () => {
    const avg = (chargeMs: number) => {
      let total = 0;
      for (let i = 0; i < 100; i++) {
        const rng = mulberry32(i);
        const s = createRush(plain(), OPPONENTS[0], mulberry32(1));
        s.mine.bar = 1;
        step(s, 0, { down: true }, T, rng);
        for (let t = 0; t < chargeMs; t += 10) step(s, 10, {}, T, rng);
        s.theirs.bar = 0;
        s.wind = null;
        const ev = step(s, 0, { up: true }, T, rng);
        const h = ev.find(e => e.kind === "hit" && e.from === "mine");
        if (h?.kind === "hit") total += h.dmg;
      }
      return total / 100;
    };
    expect(avg(RUSH.chargeMs)).toBeGreaterThan(avg(0) * 1.7);
  });

  it("getting hit cancels a charge", () => {
    const s = createRush(plain(), OPPONENTS[0], mulberry32(1));
    runUntil(s, x => x.mine.bar >= 1 && !!x.wind);
    step(s, 10, { down: true }, T, mulberry32(1));
    runUntil(s, x => !x.wind);
    expect(s.holding).toBe(false);
    expect(s.chargeMs).toBe(0);
  });

  it("enforces the swap cooldown", () => {
    const s = createRush(party(), OPPONENTS[0], mulberry32(1));
    step(s, 10, { swap: 1 }, T, mulberry32(1));
    expect(s.mine.active).toBe(1);
    expect(s.mine.bar).toBeLessThan(0.01);
    step(s, 10, { swap: 2 }, T, mulberry32(1));
    expect(s.mine.active).toBe(1);
    for (let t = 0; t < RUSH.swapCdMs; t += 10) step(s, 10, {}, T, mulberry32(1));
    if (!s.needPick) {
      step(s, 10, { swap: 2 }, T, mulberry32(1));
      expect(s.mine.active).toBe(2);
    }
  });

  it("pauses the clock while the player picks a replacement", () => {
    const s = createRush(party(), OPPONENTS[4], mulberry32(1));
    runUntil(s, x => x.needPick);
    expect(s.needPick).toBe(true);
    const t = s.t;
    step(s, 1000, {}, T, mulberry32(1));
    expect(s.t).toBe(t);
    const next = s.mine.team.findIndex(f => f.hp > 0);
    step(s, 10, { pick: next }, T, mulberry32(1));
    expect(s.needPick).toBe(false);
    expect(s.mine.active).toBe(next);
  });
});
