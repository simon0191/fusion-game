import type { Card, Opponent, Rng, Side, TimingGrade, Tuning } from "../types.js";
import { POOL, makeCard } from "../data/cards.js";
import { elementMultiplier } from "../data/elements.js";
import { between } from "../rng.js";

export interface Fighter extends Card { hp: number }

export interface BattleState {
  opp: Opponent;
  mine: Fighter[];
  theirs: Fighter[];
  turn: number;
  myPick: string | null;
  theirPick: string | null;
  over: boolean;
  result: "win" | "loss" | null;
  endReason: string;
}

export type BattleEvent =
  | { kind: "hit"; from: Side; to: Side; dmg: number; crit: boolean; effect: "super" | "weak" | null; selfHit: boolean; timing: TimingGrade }
  | { kind: "heal"; side: Side; amount: number; source: "drain" | "heal" }
  | { kind: "thorns"; side: Side; dmg: number }
  | { kind: "ko"; side: Side; id: string };

const toFighter = (c: Card): Fighter => ({ ...c, els: [...c.els], ab: { ...c.ab }, look: { ...c.look }, hp: c.maxHp });
const other = (s: Side): Side => (s === "mine" ? "theirs" : "mine");

export function createBattle(party: Card[], opp: Opponent): BattleState {
  return {
    opp,
    mine: party.map(toFighter),
    theirs: opp.cards.map(k => toFighter(makeCard(POOL[k], opp.mult))),
    turn: 1,
    myPick: null,
    theirPick: null,
    over: false,
    result: null,
    endReason: "",
  };
}

export const fighter = (b: BattleState, side: Side): Fighter | undefined => {
  const id = side === "mine" ? b.myPick : b.theirPick;
  return b[side].find(f => f.id === id);
};
export const koCount = (list: Fighter[]) => list.filter(f => f.hp <= 0).length;
export const hpShare = (list: Fighter[]) => list.reduce((s, f) => s + Math.max(0, f.hp), 0) / list.reduce((s, f) => s + f.maxHp, 0);

/** The opponent favours its healthiest monster, with some noise. */
export function enemyPick(b: BattleState, rng: Rng): Fighter {
  const alive = b.theirs.filter(f => f.hp > 0);
  const score = (f: Fighter) => f.hp / f.maxHp + rng() * 0.6;
  const scored = alive.map(f => ({ f, s: score(f) })).sort((x, y) => y.s - x.s);
  b.theirPick = scored[0].f.id;
  return scored[0].f;
}

export function choosePick(b: BattleState, id: string) {
  const f = b.mine.find(x => x.id === id);
  if (!f || f.hp <= 0) throw new Error("That monster cannot fight");
  b.myPick = id;
}

/** Which side strikes first this turn. */
export function attackOrder(b: BattleState, rng: Rng): Side[] {
  const m = fighter(b, "mine")!, t = fighter(b, "theirs")!;
  const mq = m.ab.type === "quick", tq = t.ab.type === "quick";
  const mineFirst = mq !== tq ? mq : m.spd !== t.spd ? m.spd > t.spd : rng() < 0.5;
  return mineFirst ? ["mine", "theirs"] : ["theirs", "mine"];
}

/**
 * One monster's attack. `timing` is the player's tap: it boosts damage when the player attacks
 * and blocks damage when the player is hit. Mutates the battle and returns what happened, in order.
 */
export function resolveAttack(b: BattleState, from: Side, timing: TimingGrade, T: Tuning, rng: Rng): BattleEvent[] {
  const ev: BattleEvent[] = [];
  const a = fighter(b, from)!, d = fighter(b, other(from))!;
  const hits = a.ab.type === "double" ? 2 : 1;
  for (let h = 0; h < hits; h++) {
    if (a.hp <= 0 || d.hp <= 0) break;
    const selfHit = a.ab.type === "clumsy" && rng() < 0.3;
    const target = selfHit ? a : d;
    const to = selfHit ? from : other(from);
    const mult = selfHit ? 1 : elementMultiplier(a.els, target.els);
    let dmg = a.atk * T.dmgMult * (hits === 2 ? 0.6 : 1) * mult * between(rng, 0.9, 1.1);
    const crit = a.ab.type === "crit" && rng() < 0.3;
    if (crit) dmg *= 2;
    if (a.ab.type === "burn") dmg += a.ab.v;
    if (target.ab.type === "shield" && !selfHit) dmg -= target.ab.v;
    if (!selfHit && from === "mine") dmg *= 1 + tapBonus(timing, T) / 100;
    if (!selfHit && from === "theirs") dmg *= 1 - blockShare(timing, T) / 100;
    dmg = Math.max(1, Math.round(dmg));
    if (T.alwaysWin) dmg = to === "mine" ? 0 : Math.max(dmg, target.hp);
    target.hp = Math.max(0, target.hp - dmg);
    ev.push({ kind: "hit", from, to, dmg, crit, effect: selfHit ? null : mult > 1 ? "super" : mult < 1 ? "weak" : null, selfHit, timing: selfHit ? "miss" : timing });

    if (a.ab.type === "drain" && !selfHit) {
      const gain = Math.min(a.maxHp - a.hp, Math.round(dmg / 2));
      if (gain > 0) { a.hp += gain; ev.push({ kind: "heal", side: from, amount: gain, source: "drain" }); }
    }
    if (target.ab.type === "thorns" && !selfHit && a.hp > 0 && !(T.alwaysWin && from === "mine")) {
      a.hp = Math.max(0, a.hp - target.ab.v);
      ev.push({ kind: "thorns", side: from, dmg: target.ab.v });
    }
    if (target.hp <= 0) ev.push({ kind: "ko", side: to, id: target.id });
    if (a.hp <= 0 && target !== a) ev.push({ kind: "ko", side: from, id: a.id });
  }
  if (a.ab.type === "heal" && a.hp > 0) {
    const gain = Math.min(a.maxHp - a.hp, a.ab.v);
    if (gain > 0) { a.hp += gain; ev.push({ kind: "heal", side: from, amount: gain, source: "heal" }); }
  }
  return ev;
}

const tapBonus = (t: TimingGrade, T: Tuning) => (t === "perfect" ? T.tapPerfectBonus : t === "good" ? T.tapGoodBonus : 0);
const blockShare = (t: TimingGrade, T: Tuning) => (t === "perfect" ? T.blockPerfect : t === "good" ? T.blockGood : 0);

/** Call after both attacks. Ends the battle or moves to the next turn. */
export function finishTurn(b: BattleState, T: Tuning): void {
  const myKOs = koCount(b.theirs), theirKOs = koCount(b.mine);
  const iWin = myKOs >= T.kosToWin || b.theirs.every(f => f.hp <= 0);
  const theyWin = theirKOs >= T.kosToWin || b.mine.every(f => f.hp <= 0);
  if (iWin || theyWin) {
    const win = iWin && !theyWin ? true : theyWin && !iWin ? false : hpShare(b.mine) >= hpShare(b.theirs);
    return end(b, win, "knockouts");
  }
  if (b.turn >= T.turnLimit) {
    const win = myKOs !== theirKOs ? myKOs > theirKOs : hpShare(b.mine) >= hpShare(b.theirs);
    return end(b, win, myKOs !== theirKOs ? "turn limit, decided by knockouts" : "turn limit, decided by remaining HP");
  }
  b.turn++;
  b.myPick = null;
  b.theirPick = null;
}

export function end(b: BattleState, win: boolean, reason: string) {
  b.over = true;
  b.result = win ? "win" : "loss";
  b.endReason = reason;
}
