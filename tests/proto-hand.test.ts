import { describe, expect, it } from "vitest";
import { OPPONENTS, STARTERS, makeCard } from "../shared/data/cards.js";
import {
  type ActionCard, type HandState, ENERGY, HAND_SIZE, HAND_SKILLS, TURN_LIMIT,
  beginEnemyPhase, cannotPlay, createHand, enemyAct, endTurn, finishEnemyPhase, playCard, simulateHand, validTargets,
} from "../shared/battle/protos/hand.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const T = { ...DEFAULT_TUNING, alwaysWin: false };
const party = () => STARTERS.slice(0, 3).map(t => makeCard(t));
const fresh = (seed = 1, opp = OPPONENTS[0], tuning = T) => createHand(party(), opp, tuning, mulberry32(seed));
/** Puts a specific card into the hand so a test does not depend on the shuffle. */
function give(s: HandState, pred: (c: ActionCard) => boolean) {
  const c = [...s.draw, ...s.discard].find(pred)!;
  s.draw = s.draw.filter(x => x !== c);
  s.discard = s.discard.filter(x => x !== c);
  s.hand.push(c);
  return c;
}

describe("hand battles", () => {
  it("always end within the turn limit, for every opponent and skill level", () => {
    for (const [oi, opp] of OPPONENTS.entries()) {
      for (const skill of HAND_SKILLS) {
        for (let i = 0; i < 60; i++) {
          const s = simulateHand(party(), opp, T, skill, mulberry32(oi * 1000 + i));
          expect(s.phase).toBe("over");
          expect(s.turn).toBeLessThanOrEqual(TURN_LIMIT);
          expect(s.result).not.toBeNull();
        }
      }
    }
  });

  it("alwaysWin: enemies deal no damage and every damaging card knocks out its target", () => {
    const AW = { ...T, alwaysWin: true };
    for (let i = 0; i < 40; i++) {
      const s = simulateHand(party(), OPPONENTS[4], AW, "none", mulberry32(i));
      expect(s.result).toBe("win");
      expect(s.mine.every(m => m.hp === m.maxHp)).toBe(true);
    }
    const s = fresh(3, OPPONENTS[4], AW);
    const c = give(s, x => x.kind === "strike");
    const target = s.theirs[0];
    target.block = 50;
    playCard(s, c, target.id, AW, mulberry32(1));
    expect(target.hp).toBe(0);
    beginEnemyPhase(s, AW);
    const before = s.mine.map(m => m.hp);
    for (const e of s.theirs) enemyAct(s, e.id, AW, mulberry32(2));
    expect(s.mine.map(m => m.hp)).toEqual(before);
  });

  it("enforces energy", () => {
    const s = fresh();
    expect(s.energy).toBe(ENERGY);
    expect(s.hand.length).toBe(HAND_SIZE);
    for (let i = 0; i < ENERGY; i++) give(s, x => x.kind === "strike" || x.kind === "guard");
    let played = 0;
    for (const c of [...s.hand]) {
      if (c.cost !== 1 || cannotPlay(s, c)) continue;
      if (s.energy < 1) {
        expect(cannotPlay(s, c)).toBe("Not enough energy");
        expect(() => playCard(s, c, validTargets(s, c)[0], T, mulberry32(1))).toThrow();
        continue;
      }
      playCard(s, c, validTargets(s, c)[0], T, mulberry32(1));
      played++;
    }
    expect(played).toBe(ENERGY);
    expect(s.energy).toBe(0);
  });

  it("fainted monsters' cards cannot be played and stay in the deck", () => {
    const s = fresh(5, OPPONENTS[4]);
    const victim = s.mine[0];
    const total = s.draw.length + s.hand.length + s.discard.length;
    const card = give(s, x => x.owner === victim.id && x.kind === "strike");
    beginEnemyPhase(s, T);
    victim.hp = 1;
    const e = s.theirs[0];
    e.intent = { kind: "attack", target: victim.id, base: 50, hits: 1 };
    enemyAct(s, e.id, T, mulberry32(1));
    expect(victim.hp).toBe(0);
    finishEnemyPhase(s, T, mulberry32(2));
    expect(s.draw.length + s.hand.length + s.discard.length).toBe(total);
    const owned = [...s.draw, ...s.hand, ...s.discard].filter(c => c.owner === victim.id);
    expect(owned.length).toBe(4);
    expect(owned.every(c => c.fainted)).toBe(true);
    s.hand.push(card);
    s.discard = s.discard.filter(c => c !== card);
    expect(cannotPlay(s, card)).toBe("Its monster has fainted");
    expect(() => playCard(s, card, s.theirs[1].id, T, mulberry32(1))).toThrow();
  });

  it("block absorbs damage and resets at the start of your turn", () => {
    const s = fresh(7);
    const ally = s.mine[2];
    const guard = give(s, x => x.kind === "guard");
    playCard(s, guard, ally.id, T, mulberry32(1));
    const block = ally.block;
    expect(block).toBeGreaterThan(0);
    beginEnemyPhase(s, T);
    for (const e of s.theirs) e.intent = { kind: "guard", amount: 1 };
    const e = s.theirs[0];
    e.intent = { kind: "attack", target: ally.id, base: block + 5, hits: 1 };
    const hp = ally.hp;
    const ev = enemyAct(s, e.id, T, mulberry32(1));
    const hit = ev.find(x => x.kind === "hit")!;
    expect(hit.kind === "hit" && hit.blocked).toBe(block);
    expect(hp - ally.hp).toBe(Math.round((block + 5) * (e.els[0] === "fire" ? 1.5 : 1)) - block);
    ally.block = 3;
    for (const x of s.theirs.slice(1)) enemyAct(s, x.id, T, mulberry32(1));
    finishEnemyPhase(s, T, mulberry32(2));
    expect(ally.block).toBe(0);
  });

  it("enemy block absorbs your strikes", () => {
    const s = fresh(8);
    const t = s.theirs[1];
    t.block = 5;
    const c = give(s, x => x.kind === "strike");
    const hp = t.hp;
    const ev = playCard(s, c, t.id, T, mulberry32(1));
    const hit = ev.find(x => x.kind === "hit")!;
    expect(hit.kind === "hit" && hit.blocked).toBe(5);
    expect(t.block).toBe(0);
    expect(hp - t.hp).toBe(hit.kind === "hit" ? hit.dmg : -1);
  });

  it("reshuffles the discard pile when the draw pile runs out", () => {
    const s = fresh(9);
    const total = s.draw.length + s.hand.length;
    expect(total).toBe(12);
    const rng = mulberry32(4);
    for (let i = 0; i < 3 && s.phase !== "over"; i++) endTurn(s, { ...T, dmgMult: 0.01 }, rng);
    expect(s.reshuffles).toBeGreaterThan(0);
    expect(s.draw.length + s.hand.length + s.discard.length).toBe(total);
    expect(new Set([...s.draw, ...s.hand, ...s.discard].map(c => c.uid)).size).toBe(total);
  });

  it("uses all three monsters and builds a 4-card kit per monster", () => {
    const s = fresh(10);
    const all = [...s.draw, ...s.hand];
    for (const m of s.mine) {
      const own = all.filter(c => c.owner === m.id);
      expect(own.filter(c => c.kind === "strike").length).toBe(2);
      expect(own.filter(c => c.kind === "guard").length).toBe(1);
      expect(own.filter(c => c.kind === "ability").map(c => c.ab)).toEqual([m.ab.type]);
    }
    expect(s.theirs.every(e => e.intent)).toBe(true);

  });
});
