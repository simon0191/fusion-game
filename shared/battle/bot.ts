import type { Card, Rng, TimingGrade, Tuning } from "../types";
import { elementMultiplier } from "../data/elements";
import { type BattleState, attackOrder, choosePick, createBattle, enemyPick, finishTurn, resolveAttack } from "./engine";
import type { Opponent } from "../types";

/** Odds of each tap grade for a simulated player. */
export interface TapSkill { perfect: number; good: number }
export const SKILL = {
  none: { perfect: 0, good: 0 },
  casual: { perfect: 0.25, good: 0.45 },
  skilled: { perfect: 0.6, good: 0.35 },
} satisfies Record<string, TapSkill>;

export function rollTap(s: TapSkill, rng: Rng): TimingGrade {
  const r = rng();
  return r < s.perfect ? "perfect" : r < s.perfect + s.good ? "good" : "miss";
}

/** Sensible player: pick the monster with the best trade against the enemy on the field. */
export function botPick(b: BattleState): string {
  const t = b.theirs.find(f => f.id === b.theirPick)!;
  const alive = b.mine.filter(f => f.hp > 0);
  const score = (m: (typeof alive)[number]) =>
    elementMultiplier(m.els, t.els) * m.atk - 0.6 * elementMultiplier(t.els, m.els) * t.atk + 10 * (m.hp / m.maxHp);
  return alive.sort((x, y) => score(y) - score(x))[0].id;
}

export function simulateBattle(party: Card[], opp: Opponent, T: Tuning, skill: TapSkill, rng: Rng): BattleState {
  const b = createBattle(party, opp);
  while (!b.over) {
    enemyPick(b, rng);
    choosePick(b, botPick(b));
    for (const side of attackOrder(b, rng)) resolveAttack(b, side, rollTap(skill, rng), T, rng);
    finishTurn(b, T);
  }
  return b;
}
