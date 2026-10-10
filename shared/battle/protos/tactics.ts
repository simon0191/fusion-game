/**
 * Tactics prototype: one active monster per side, two on the bench. Each turn both sides pick an
 * action in secret, then the turn resolves.
 *
 * Rules:
 * - Strike: a normal hit with the passive ability, as in Classic. +1 energy.
 * - Special: costs 3 energy, a powered move set by the ability (see SPECIALS).
 * - Guard: Strikes deal only 25% and each one is countered at 70% power. Specials break through
 *   a guard at full damage. +2 energy.
 * - Swap: bring in a bench monster before attacks; it takes any hit this turn.
 * - Energy belongs to each monster, starts at 1 and caps at 5. Specials pay when chosen, so a
 *   monster knocked out before it acts loses the energy.
 * - Order: swaps, then guards and defensive specials (Bulwark, Spikes), then attacks. Attackers go
 *   in speed order: Blitz special first, then the Quick ability, then higher speed, ties random.
 * - Burn from Scorch ticks at the end of each turn for 3 turns, on the bench too.
 * - A knocked-out active monster is replaced for free at the start of the next turn.
 * - Win at `T.kosToWin` knockouts or when the other team is out. After 15 turns, most knockouts
 *   wins, then the higher share of remaining HP.
 * - Each enemy choice comes with a hint about its intent, honest 75% of the time. The enemy
 *   notices when you guard in 2 of your last 3 turns and answers with Specials.
 * - Tuning: `dmgMult` scales every hit. With `alwaysWin`, you take no damage and any hit of yours
 *   knocks out, through guards and blocks.
 * - Timing taps work as in Classic: your tap powers your Strike or Special, and your tap when hit
 *   blocks part of the damage (or powers your counter while you guard or Bulwark is up).
 */
import type { AbilityType, Card, Opponent, Rng, Side, TimingGrade, Tuning } from "../../types.js";
import { POOL, makeCard } from "../../data/cards.js";
import { elementMultiplier } from "../../data/elements.js";
import { between } from "../../rng.js";
import type { Fighter } from "../engine.js";
import { SKILL, rollTap, type TapSkill } from "../bot.js";

export const TACTICS = {
  turnLimit: 15,
  energyStart: 1,
  energyMax: 5,
  specialCost: 3,
  strikeGain: 1,
  guardGain: 2,
  /** Share of damage a guarding monster still takes. */
  guardTaken: 0.25,
  /** Power of the counter a guarding monster makes when a Strike hits it. */
  guardCounter: 0.7,
  burnTurns: 3,
  hintAccuracy: 0.75,
};

export const SPECIALS: Record<AbilityType, { name: string; describe: string }> = {
  burn: { name: "Scorch", describe: "Hit and set a burn that ticks for 3 turns." },
  heal: { name: "Bloom", describe: "Hit, then heal 40% of max HP." },
  double: { name: "Flurry", describe: "Hit three times." },
  shield: { name: "Bulwark", describe: "Block every hit this turn and counter each one." },
  quick: { name: "Blitz", describe: "Go before everyone and hit twice." },
  drain: { name: "Leech", describe: "Strong hit that heals 75% of the damage." },
  thorns: { name: "Spikes", describe: "Hit, and bounce the next hit you take back at the attacker." },
  crit: { name: "Jackpot", describe: "A guaranteed double-damage hit." },
  clumsy: { name: "Haymaker", describe: "Huge hit with a 40% chance to hit itself." },
};

export type ActionKind = "strike" | "special" | "guard" | "swap";
export type Action = { kind: "strike" } | { kind: "special" } | { kind: "guard" } | { kind: "swap"; to: string };

export interface TFighter extends Fighter { energy: number; burnTurns: number; burnDmg: number; reflect: boolean }

export interface TacticsState {
  opp: Opponent;
  mine: TFighter[];
  theirs: TFighter[];
  active: Record<Side, string>;
  turn: number;
  acts: Record<Side, Action | null>;
  guard: Record<Side, boolean>;
  shield: Record<Side, boolean>;
  /** The player's past choices, which the enemy AI reads. */
  history: ActionKind[];
  over: boolean;
  result: "win" | "loss" | null;
  endReason: string;
}

export type TEvent =
  | { kind: "swap"; side: Side; from: string; to: string }
  | { kind: "guard"; side: Side }
  | { kind: "shieldUp"; side: Side }
  | { kind: "reflectUp"; side: Side }
  | { kind: "special"; side: Side }
  | { kind: "hit"; from: Side; to: Side; dmg: number; crit: boolean; effect: "super" | "weak" | null; selfHit: boolean; timing: TimingGrade; blocked: "guard" | "shield" | null; counter: boolean }
  | { kind: "reflect"; side: Side; dmg: number }
  | { kind: "thorns"; side: Side; dmg: number }
  | { kind: "heal"; side: Side; amount: number }
  | { kind: "burnSet"; side: Side; id: string }
  | { kind: "burn"; side: Side; id: string; dmg: number }
  | { kind: "ko"; side: Side; id: string };

export interface Intent { action: Action; hint: ActionKind; text: string }

export const other = (s: Side): Side => (s === "mine" ? "theirs" : "mine");
const toT = (c: Card): TFighter => ({ ...c, els: [...c.els], ab: { ...c.ab }, look: { ...c.look }, hp: c.maxHp, energy: TACTICS.energyStart, burnTurns: 0, burnDmg: 0, reflect: false });
const firstAlive = (list: TFighter[]) => list.find(f => f.hp > 0)?.id ?? list[0].id;

export function createTactics(party: Card[], opp: Opponent): TacticsState {
  const mine = party.map(toT), theirs = opp.cards.map(k => toT(makeCard(POOL[k], opp.mult)));
  return {
    opp, mine, theirs,
    active: { mine: firstAlive(mine), theirs: firstAlive(theirs) },
    turn: 1,
    acts: { mine: null, theirs: null },
    guard: { mine: false, theirs: false },
    shield: { mine: false, theirs: false },
    history: [],
    over: false, result: null, endReason: "",
  };
}

export const active = (b: TacticsState, side: Side) => b[side].find(f => f.id === b.active[side])!;
export const bench = (b: TacticsState, side: Side) => b[side].filter(f => f.id !== b.active[side] && f.hp > 0);
export const koCount = (list: TFighter[]) => list.filter(f => f.hp <= 0).length;
export const hpShare = (list: TFighter[]) => list.reduce((s, f) => s + Math.max(0, f.hp), 0) / list.reduce((s, f) => s + f.maxHp, 0);

export function canUse(b: TacticsState, side: Side, kind: ActionKind): boolean {
  const f = active(b, side);
  if (f.hp <= 0) return false;
  if (kind === "special") return f.energy >= TACTICS.specialCost;
  if (kind === "swap") return bench(b, side).length > 0;
  return true;
}

function validate(b: TacticsState, side: Side, a: Action) {
  if (!canUse(b, side, a.kind)) throw new Error(`${side} cannot ${a.kind} now`);
  if (a.kind === "swap" && !bench(b, side).some(f => f.id === a.to)) throw new Error("That monster cannot swap in");
}

/** Swaps, guards and defensive specials. Call once per turn with both secret choices. */
export function beginTurn(b: TacticsState, mine: Action, theirs: Action): TEvent[] {
  validate(b, "mine", mine);
  validate(b, "theirs", theirs);
  b.acts = { mine, theirs };
  b.history.push(mine.kind);
  const ev: TEvent[] = [];
  for (const side of ["mine", "theirs"] as Side[]) {
    const a = b.acts[side]!;
    if (a.kind === "swap") {
      ev.push({ kind: "swap", side, from: b.active[side], to: a.to });
      b.active[side] = a.to;
    }
  }
  for (const side of ["mine", "theirs"] as Side[]) {
    const a = b.acts[side]!, f = active(b, side);
    if (a.kind === "guard") {
      b.guard[side] = true;
      f.energy = Math.min(TACTICS.energyMax, f.energy + TACTICS.guardGain);
      ev.push({ kind: "guard", side });
    } else if (a.kind === "special") {
      f.energy -= TACTICS.specialCost;
      if (f.ab.type === "shield") { b.shield[side] = true; ev.push({ kind: "shieldUp", side }); }
      if (f.ab.type === "thorns") { f.reflect = true; ev.push({ kind: "reflectUp", side }); }
    }
  }
  return ev;
}

const attacks = (b: TacticsState, side: Side) => {
  const a = b.acts[side];
  return !!a && (a.kind === "strike" || (a.kind === "special" && active(b, side).ab.type !== "shield"));
};
const priority = (b: TacticsState, side: Side) => {
  const f = active(b, side), a = b.acts[side]!;
  return a.kind === "special" && f.ab.type === "quick" ? 2 : f.ab.type === "quick" ? 1 : 0;
};

/** Sides that attack this turn, in the order they go. */
export function turnOrder(b: TacticsState, rng: Rng): Side[] {
  const sides = (["mine", "theirs"] as Side[]).filter(s => attacks(b, s));
  if (sides.length < 2) return sides;
  const [m, t] = [active(b, "mine"), active(b, "theirs")];
  const pm = priority(b, "mine"), pt = priority(b, "theirs");
  const mineFirst = pm !== pt ? pm > pt : m.spd !== t.spd ? m.spd > t.spd : rng() < 0.5;
  return mineFirst ? ["mine", "theirs"] : ["theirs", "mine"];
}

const tapBonus = (t: TimingGrade, T: Tuning) => (t === "perfect" ? T.tapPerfectBonus : t === "good" ? T.tapGoodBonus : 0);
const blockShare = (t: TimingGrade, T: Tuning) => (t === "perfect" ? T.blockPerfect : t === "good" ? T.blockGood : 0);

function damage(f: TFighter, side: Side, dmg: number, ev: TEvent[]) {
  f.hp = Math.max(0, f.hp - dmg);
  if (f.hp <= 0) ev.push({ kind: "ko", side, id: f.id });
}

interface HitOpts { power: number; critChance?: number; forceCrit?: boolean; selfHitChance?: number; burnBonus?: number; drainShare?: number; counter?: boolean }

/** One hit from `from`'s active monster. `timing` is always the player's tap. */
function hit(b: TacticsState, from: Side, o: HitOpts, timing: TimingGrade, T: Tuning, rng: Rng, ev: TEvent[]) {
  const to = other(from), a = active(b, from), d = active(b, to);
  if (a.hp <= 0 || d.hp <= 0) return;
  const rand = between(rng, 0.9, 1.1);
  if (o.selfHitChance && rng() < o.selfHitChance) {
    const dmg = T.alwaysWin && from === "mine" ? 0 : Math.max(1, Math.round(a.atk * T.dmgMult * rand));
    ev.push({ kind: "hit", from, to: from, dmg, crit: false, effect: null, selfHit: true, timing: "miss", blocked: null, counter: !!o.counter });
    damage(a, from, dmg, ev);
    return;
  }
  const mult = elementMultiplier(a.els, d.els);
  let dmg = a.atk * T.dmgMult * o.power * mult * rand;
  const crit = !!o.forceCrit || (!!o.critChance && rng() < o.critChance);
  if (crit) dmg *= 2;
  dmg += o.burnBonus ?? 0;
  if (d.ab.type === "shield") dmg -= d.ab.v;
  if (from === "mine") dmg *= 1 + tapBonus(timing, T) / 100;
  else if (!b.shield[to]) dmg *= 1 - blockShare(timing, T) / 100;
  const guarded = b.guard[to] && !(b.acts[from]?.kind === "special" && !o.counter);
  if (guarded) dmg *= TACTICS.guardTaken;
  dmg = Math.max(1, Math.round(dmg));
  let blocked: "guard" | "shield" | null = guarded ? "guard" : null;
  if (b.shield[to]) { dmg = 0; blocked = "shield"; }
  let reflected = d.reflect && dmg > 0;
  if (T.alwaysWin) {
    if (from === "mine") { dmg = d.hp; blocked = null; reflected = false; }
    else { dmg = 0; reflected = false; }
  }
  const effect = mult > 1 ? "super" : mult < 1 ? "weak" : null;
  ev.push({ kind: "hit", from, to, dmg: reflected ? 0 : dmg, crit, effect, selfHit: false, timing: from === "mine" ? timing : b.shield[to] ? "miss" : timing, blocked, counter: !!o.counter });
  if (reflected) {
    d.reflect = false;
    ev.push({ kind: "reflect", side: from, dmg });
    damage(a, from, dmg, ev);
    return;
  }
  damage(d, to, dmg, ev);
  if (o.drainShare && dmg > 0 && a.hp > 0) {
    const gain = Math.min(a.maxHp - a.hp, Math.round(dmg * o.drainShare));
    if (gain > 0) { a.hp += gain; ev.push({ kind: "heal", side: from, amount: gain }); }
  }
  if (d.ab.type === "thorns" && dmg > 0 && a.hp > 0 && !(T.alwaysWin && from === "mine")) {
    const t = T.alwaysWin ? 0 : d.ab.v;
    ev.push({ kind: "thorns", side: from, dmg: t });
    damage(a, from, t, ev);
  }
  if (blocked && d.hp > 0 && a.hp > 0 && !o.counter) {
    // The counter belongs to the defending side; when that is the player, their block tap powers it.
    hit(b, to, { power: blocked === "shield" ? 1 : TACTICS.guardCounter, counter: true }, to === "mine" ? timing : "miss", T, rng, ev);
  }
}

/** The side's Strike or Special. Returns nothing if its monster is down or did not attack. */
export function resolveAction(b: TacticsState, side: Side, timing: TimingGrade, T: Tuning, rng: Rng): TEvent[] {
  const ev: TEvent[] = [];
  const a = active(b, side), d = active(b, other(side)), act = b.acts[side];
  if (!act || a.hp <= 0 || d.hp <= 0 || !attacks(b, side)) return ev;
  const ab = a.ab;
  if (act.kind === "strike") {
    const hits = ab.type === "double" ? 2 : 1;
    for (let i = 0; i < hits; i++) {
      hit(b, side, {
        power: hits === 2 ? 0.6 : 1,
        critChance: ab.type === "crit" ? 0.3 : 0,
        selfHitChance: ab.type === "clumsy" ? 0.3 : 0,
        burnBonus: ab.type === "burn" ? ab.v : 0,
        drainShare: ab.type === "drain" ? 0.5 : 0,
      }, timing, T, rng, ev);
    }
    if (ab.type === "heal" && a.hp > 0) {
      const gain = Math.min(a.maxHp - a.hp, ab.v);
      if (gain > 0) { a.hp += gain; ev.push({ kind: "heal", side, amount: gain }); }
    }
    if (a.hp > 0) a.energy = Math.min(TACTICS.energyMax, a.energy + TACTICS.strikeGain);
    return ev;
  }
  ev.push({ kind: "special", side });
  switch (ab.type) {
    case "burn": {
      hit(b, side, { power: 1, burnBonus: ab.v }, timing, T, rng, ev);
      if (d.hp > 0 && !b.shield[other(side)]) {
        d.burnTurns = TACTICS.burnTurns;
        d.burnDmg = Math.max(2, Math.round(a.atk * T.dmgMult * 0.3 + ab.v));
        ev.push({ kind: "burnSet", side: other(side), id: d.id });
      }
      break;
    }
    case "heal": {
      hit(b, side, { power: 1 }, timing, T, rng, ev);
      const gain = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * 0.4));
      if (a.hp > 0 && gain > 0) { a.hp += gain; ev.push({ kind: "heal", side, amount: gain }); }
      break;
    }
    case "double": for (let i = 0; i < 3; i++) hit(b, side, { power: 0.5 }, timing, T, rng, ev); break;
    case "quick": for (let i = 0; i < 2; i++) hit(b, side, { power: 0.8 }, timing, T, rng, ev); break;
    case "drain": hit(b, side, { power: 1.2, drainShare: 0.75 }, timing, T, rng, ev); break;
    case "thorns": hit(b, side, { power: 1 }, timing, T, rng, ev); break;
    case "crit": hit(b, side, { power: 1, forceCrit: true }, timing, T, rng, ev); break;
    case "clumsy": hit(b, side, { power: 2.2, selfHitChance: 0.4 }, timing, T, rng, ev); break;
    case "shield": break;
  }
  return ev;
}

/** Burn ticks, clears this turn's guards, and ends the battle or moves to the next turn. */
export function endTurn(b: TacticsState, T: Tuning): TEvent[] {
  const ev: TEvent[] = [];
  if (!decide(b, T, false)) {
    for (const side of ["mine", "theirs"] as Side[]) {
      for (const f of b[side]) {
        if (f.hp <= 0 || f.burnTurns <= 0) continue;
        f.burnTurns--;
        const dmg = T.alwaysWin && side === "mine" ? 0 : f.burnDmg;
        ev.push({ kind: "burn", side, id: f.id, dmg });
        damage(f, side, dmg, ev);
      }
    }
    decide(b, T, true);
  }
  b.acts = { mine: null, theirs: null };
  b.guard = { mine: false, theirs: false };
  b.shield = { mine: false, theirs: false };
  if (!b.over) b.turn++;
  return ev;
}

function decide(b: TacticsState, T: Tuning, atLimit: boolean): boolean {
  const myKOs = koCount(b.theirs), theirKOs = koCount(b.mine);
  const iWin = myKOs >= T.kosToWin || b.theirs.every(f => f.hp <= 0);
  const theyWin = theirKOs >= T.kosToWin || b.mine.every(f => f.hp <= 0);
  if (iWin || theyWin) {
    end(b, iWin && !theyWin ? true : theyWin && !iWin ? false : hpShare(b.mine) >= hpShare(b.theirs), "knockouts");
    return true;
  }
  if (atLimit && b.turn >= TACTICS.turnLimit) {
    const win = myKOs !== theirKOs ? myKOs > theirKOs : hpShare(b.mine) >= hpShare(b.theirs);
    end(b, win, myKOs !== theirKOs ? "turn limit, decided by knockouts" : "turn limit, decided by remaining HP");
    return true;
  }
  return false;
}

export function end(b: TacticsState, win: boolean, reason: string) {
  b.over = true;
  b.result = win ? "win" : "loss";
  b.endReason = reason;
}

export const needsReplacement = (b: TacticsState, side: Side) => !b.over && active(b, side).hp <= 0 && bench(b, side).length > 0;

export function sendIn(b: TacticsState, side: Side, id: string) {
  if (!bench(b, side).some(f => f.id === id)) throw new Error("That monster cannot come in");
  b.active[side] = id;
}

/* ---------- Choosing ---------- */

/** How well `f` would do against `foe`: its hitting power minus what it takes, plus remaining health. */
const matchup = (f: TFighter, foe: TFighter) =>
  elementMultiplier(f.els, foe.els) * f.atk - 0.6 * elementMultiplier(foe.els, f.els) * foe.atk + 10 * (f.hp / f.maxHp);

export function bestReplacement(b: TacticsState, side: Side, rng: Rng, noise = 0): string {
  const foe = active(b, other(side));
  return bench(b, side).map(f => ({ f, s: matchup(f, foe) + rng() * noise })).sort((x, y) => y.s - x.s)[0].f.id;
}

const HINTS: Record<ActionKind, string> = {
  strike: "looks aggressive",
  special: "is gathering power",
  guard: "looks defensive",
  swap: "keeps glancing at its bench",
};

/** The enemy's secret choice for this turn, plus a hint that is honest most of the time. */
export function enemyChoose(b: TacticsState, rng: Rng): Intent {
  const me = active(b, "theirs"), foe = active(b, "mine");
  const hpP = me.hp / me.maxHp;
  const badMatch = elementMultiplier(foe.els, me.els) > 1;
  const better = bench(b, "theirs").filter(f => elementMultiplier(foe.els, f.els) <= 1 && f.hp / f.maxHp > 0.4);
  const guardHappy = b.history.slice(-3).filter(k => k === "guard").length >= 2;
  let action: Action;
  if (guardHappy && me.energy >= TACTICS.specialCost && rng() < 0.8) action = { kind: "special" };
  else if (guardHappy && rng() < 0.4) action = { kind: "guard" };
  else if (badMatch && better.length && hpP > 0.25 && rng() < 0.45) action = { kind: "swap", to: better.sort((x, y) => matchup(y, foe) - matchup(x, foe))[0].id };
  else if (me.energy >= TACTICS.specialCost && rng() < 0.5) action = { kind: "special" };
  else if (hpP < 0.35 && me.energy < TACTICS.specialCost && rng() < 0.55) action = { kind: "guard" };
  else if (foe.energy >= TACTICS.specialCost && rng() < 0.25) action = { kind: "guard" };
  else if (rng() < 0.08) action = { kind: "guard" };
  else action = { kind: "strike" };

  let hint = action.kind;
  if (rng() > TACTICS.hintAccuracy) {
    const lies = (["strike", "special", "guard", "swap"] as ActionKind[]).filter(k => k !== action.kind && canUse(b, "theirs", k));
    if (lies.length) hint = lies[Math.floor(rng() * lies.length)];
  }
  return { action, hint, text: HINTS[hint] };
}

/** A sensible player for the simulator. It trusts the hint. */
export function botChoose(b: TacticsState, hint: ActionKind, rng: Rng): Action {
  const me = active(b, "mine"), foe = active(b, "theirs");
  const threat = hint === "strike" || hint === "special";
  if (me.energy >= TACTICS.specialCost) {
    if (me.ab.type !== "shield" || threat) return { kind: "special" };
  }
  if (hint === "strike" && rng() < 0.5) return { kind: "guard" };
  const alt = bench(b, "mine").sort((x, y) => matchup(y, foe) - matchup(x, foe))[0];
  if (alt && matchup(alt, foe) > matchup(me, foe) + 8 && rng() < 0.5) return { kind: "swap", to: alt.id };
  return { kind: "strike" };
}

export function simulateTactics(party: Card[], opp: Opponent, T: Tuning, skill: TapSkill = SKILL.casual, rng: Rng = Math.random): TacticsState {
  const b = createTactics(party, opp);
  while (!b.over) {
    if (needsReplacement(b, "theirs")) sendIn(b, "theirs", bestReplacement(b, "theirs", rng, 4));
    if (needsReplacement(b, "mine")) sendIn(b, "mine", bestReplacement(b, "mine", rng));
    const intent = enemyChoose(b, rng);
    beginTurn(b, botChoose(b, intent.hint, rng), intent.action);
    for (const side of turnOrder(b, rng)) resolveAction(b, side, rollTap(skill, rng), T, rng);
    endTurn(b, T);
  }
  return b;
}
