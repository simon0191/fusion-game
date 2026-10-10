import { describe, expect, it } from "vitest";
import { STARTERS, OPPONENTS, makeCard } from "../shared/data/cards.js";
import { SKILL } from "../shared/battle/bot.js";
import {
  TACTICS, type Action, type TacticsState, active, beginTurn, bench, canUse, createTactics, endTurn, enemyChoose,
  resolveAction, simulateTactics, turnOrder,
} from "../shared/battle/protos/tactics.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";
import type { AbilityType } from "../shared/types.js";

const T = { ...DEFAULT_TUNING, alwaysWin: false };
const party = () => STARTERS.slice(0, 3).map(t => makeCard(t));

/** One full turn with fixed choices and taps. */
function play(b: TacticsState, mine: Action, theirs: Action, seed = 1, tuning = T) {
  const rng = mulberry32(seed);
  const ev = beginTurn(b, mine, theirs);
  for (const side of turnOrder(b, rng)) ev.push(...resolveAction(b, side, "miss", tuning, rng));
  ev.push(...endTurn(b, tuning));
  return ev;
}

/** A battle where my lead monster has the given ability. */
function withAbility(type: AbilityType, v = 3) {
  const p = party();
  p[0].ab = { type, v };
  return createTactics(p, OPPONENTS[0]);
}

describe("tactics battle flow", () => {
  it("always ends within the turn limit", () => {
    for (let i = 0; i < 300; i++) {
      const b = simulateTactics(party(), OPPONENTS[i % OPPONENTS.length], T, Object.values(SKILL)[i % 3], mulberry32(i));
      expect(b.over).toBe(true);
      expect(b.turn).toBeLessThanOrEqual(TACTICS.turnLimit);
    }
  });

  it("always win: you take no damage and every hit of yours knocks out", () => {
    const AW = { ...T, alwaysWin: true };
    for (let i = 0; i < 50; i++) {
      const b = simulateTactics(party(), OPPONENTS[4], AW, SKILL.none, mulberry32(i));
      expect(b.result).toBe("win");
      expect(b.mine.every(f => f.hp === f.maxHp)).toBe(true);
    }
    const b = createTactics(party(), OPPONENTS[4]);
    play(b, { kind: "strike" }, { kind: "guard" }, 2, AW);
    expect(b.theirs[0].hp).toBe(0);
  });
});

describe("energy", () => {
  it("starts at 1, a special needs 3 and costs 3", () => {
    const b = createTactics(party(), OPPONENTS[0]);
    expect(active(b, "mine").energy).toBe(1);
    expect(canUse(b, "mine", "special")).toBe(false);
    expect(() => beginTurn(b, { kind: "special" }, { kind: "guard" })).toThrow();
    active(b, "mine").energy = 3;
    beginTurn(b, { kind: "special" }, { kind: "guard" });
    expect(active(b, "mine").energy).toBe(0);
  });

  it("strike gives 1, guard gives 2, and it caps at 5", () => {
    const b = createTactics(party(), OPPONENTS[0]);
    active(b, "mine").maxHp = active(b, "mine").hp = 999;
    play(b, { kind: "strike" }, { kind: "guard" });
    expect(active(b, "mine").energy).toBe(2);
    play(b, { kind: "guard" }, { kind: "guard" });
    expect(active(b, "mine").energy).toBe(4);
    play(b, { kind: "guard" }, { kind: "guard" });
    expect(active(b, "mine").energy).toBe(5);
  });
});

describe("swap and order", () => {
  it("a swapped-in monster takes the incoming hit", () => {
    const b = createTactics(party(), OPPONENTS[0]);
    const lead = active(b, "mine"), sub = bench(b, "mine")[0];
    const ev = play(b, { kind: "swap", to: sub.id }, { kind: "strike" });
    expect(ev[0]).toMatchObject({ kind: "swap", side: "mine" });
    expect(active(b, "mine").id).toBe(sub.id);
    expect(lead.hp).toBe(lead.maxHp);
    expect(sub.hp).toBeLessThan(sub.maxHp);
  });

  it("guards resolve before attacks, even against a faster attacker", () => {
    const b = createTactics(party(), OPPONENTS[0]);
    const ev = play(b, { kind: "guard" }, { kind: "strike" });
    expect(ev.findIndex(e => e.kind === "guard")).toBeLessThan(ev.findIndex(e => e.kind === "hit"));
    expect(ev.find(e => e.kind === "hit" && e.to === "mine")).toMatchObject({ blocked: "guard" });
  });

  it("quick goes first, and Blitz goes before Quick", () => {
    const b = withAbility("quick");
    active(b, "mine").spd = 1;
    b.acts = { mine: { kind: "strike" }, theirs: { kind: "strike" } };
    expect(turnOrder(b, mulberry32(1))[0]).toBe("mine");
    active(b, "theirs").ab = { type: "quick", v: 0 };
    active(b, "theirs").energy = 3;
    b.acts = { mine: { kind: "strike" }, theirs: { kind: "special" } };
    expect(turnOrder(b, mulberry32(1))[0]).toBe("theirs");
  });

  it("a special breaks through a guard", () => {
    const b = withAbility("crit");
    active(b, "mine").energy = 3;
    const ev = play(b, { kind: "special" }, { kind: "guard" });
    expect(ev.find(e => e.kind === "hit" && e.from === "mine")).toMatchObject({ blocked: null, crit: true });
  });
});

describe("specials", () => {
  it("Scorch sets a burn that ticks at the end of the turn", () => {
    const b = withAbility("burn");
    active(b, "mine").energy = 3;
    const foe = active(b, "theirs");
    foe.maxHp = foe.hp = 999;
    const ev = play(b, { kind: "special" }, { kind: "guard" });
    expect(ev.some(e => e.kind === "burnSet")).toBe(true);
    expect(ev.some(e => e.kind === "burn" && e.dmg > 0)).toBe(true);
    expect(foe.burnTurns).toBe(TACTICS.burnTurns - 1);
  });

  it("Bulwark blocks every hit and counters", () => {
    const b = withAbility("shield");
    active(b, "mine").energy = 3;
    const me = active(b, "mine");
    const ev = play(b, { kind: "special" }, { kind: "strike" });
    expect(me.hp).toBe(me.maxHp);
    expect(ev.find(e => e.kind === "hit" && e.to === "mine")).toMatchObject({ dmg: 0, blocked: "shield" });
    expect(ev.find(e => e.kind === "hit" && e.from === "mine")).toMatchObject({ counter: true });
  });

  it("Bloom heals a big chunk", () => {
    const b = withAbility("heal");
    const me = active(b, "mine");
    me.energy = 3;
    me.hp = 5;
    play(b, { kind: "special" }, { kind: "guard" });
    expect(me.hp).toBeGreaterThanOrEqual(5 + Math.round(me.maxHp * 0.4));
  });
});

describe("enemy intent", () => {
  it("never claims a move the enemy cannot make", () => {
    for (let i = 0; i < 200; i++) {
      const b = createTactics(party(), OPPONENTS[i % OPPONENTS.length]);
      const intent = enemyChoose(b, mulberry32(i));
      expect(canUse(b, "theirs", intent.hint)).toBe(true);
      expect(canUse(b, "theirs", intent.action.kind)).toBe(true);
    }
  });
});
