/**
 * Rush: a real-time battle prototype. No turns; both sides act as fast as their action bars allow.
 *
 * Rules
 * - One active monster per side, the other two on the bench. Each active monster has an action bar
 *   that fills in about 1.5 s (SPD 9) to 2.9 s (SPD 2). Quick monsters fill 20% faster.
 * - Player attack: when your bar is full, tap to attack. Holding first charges the hit up to 2x over 1.2 s.
 *   Taking a hit (anything but a perfect block) cancels the charge.
 * - Enemy attack: when its bar fills it winds up for 700 ms, then hits. Block in the last 150 ms for a
 *   perfect block (no damage, plus a counter hit at half power). Blocking earlier in the wind-up halves the
 *   damage. Blocking when nothing is coming whiffs and locks Block for 700 ms. One block per wind-up.
 * - Special meter fills as you deal and take damage. A full meter fires the active monster's ability move:
 *   burn sets a burn (4 ticks over 4 s), heal restores 40% HP, double fires 3 hits at 60%, shield cuts damage
 *   by 60% for 5 s, quick hits and refills the bar, drain hits at 1.2x and heals 80% of it, thorns reflects
 *   60% of damage taken for 5 s, crit is a guaranteed double-damage hit, clumsy hits at 2.6x with a 40%
 *   self-hit chance.
 * - Passive abilities work on normal attacks as in Classic, scaled to Rush damage.
 * - Swap any time to a healthy bench monster; 4 s cooldown. The incoming monster starts with an empty bar,
 *   and burn, shield and thorns effects on the outgoing side end. After a KO you pick a replacement while
 *   the clock is paused.
 * - Element multipliers as in Classic. Win at `T.kosToWin` knockouts or when the enemy team is out.
 *   After 90 s the battle is decided by knockouts, then by share of HP left.
 * - Tuning: `dmgMult` scales all damage. `alwaysWin` makes enemy damage 0 and any damaging hit of yours a KO.
 *
 * The engine is a deterministic step function: `step(state, dtMs, input, T, rng)` mutates the state and
 * returns what happened. The browser drives it from requestAnimationFrame; the simulator runs it at a fixed dt.
 */
import type { AbilityType, Card, Opponent, Rng, Side, Tuning } from "../../types.js";
import { TEAM_SIZE, randomMonsters } from "../../data/cards.js";
import { elementMultiplier } from "../../data/elements.js";
import { between } from "../../rng.js";
import { type Fighter, hpShare, koCount } from "../engine.js";

export const RUSH = {
  timeLimitMs: 90_000,
  windMs: 700,
  perfectMs: 150,
  whiffCdMs: 700,
  chargeMs: 1200,
  chargeMax: 2,
  swapCdMs: 4000,
  /** Rush hits land every couple of seconds, so each one is smaller than a Classic hit. */
  dmgScale: 0.5,
  counterPower: 0.5,
  /** Special meter gained per full max HP of damage dealt or taken. */
  meterDealt: 0.4,
  meterTaken: 0.4,
  buffMs: 5000,
  shieldCut: 0.6,
  thornsShare: 0.6,
  burnMs: 4000,
  burnTickMs: 1000,
};

export const SPECIAL_NAMES: Record<AbilityType, string> = {
  burn: "Flame burst", heal: "Big regrow", double: "Flurry", shield: "Iron shell", quick: "Rush in",
  drain: "Life drain", thorns: "Spike skin", crit: "Lucky strike", clumsy: "Wild slam",
};

export type BlockGrade = "perfect" | "half";

export interface RushSide {
  team: Fighter[];
  active: number;
  /** Action bar, 0 to 1. */
  bar: number;
  /** Special meter, 0 to 1. */
  special: number;
  swapCd: number;
  burnMs: number;
  burnTickMs: number;
  burnDmg: number;
  shieldMs: number;
  thornsMs: number;
}

export interface RushState {
  opp: Opponent;
  /** Battle clock in ms. Stops while the player picks a replacement. */
  t: number;
  mine: RushSide;
  theirs: RushSide;
  holding: boolean;
  chargeMs: number;
  /** Enemy wind-up in progress, and the player's block for it. */
  wind: { ms: number; block: BlockGrade | null } | null;
  blockCd: number;
  needPick: boolean;
  ai: { thinkMs: number; specialAt: number | null };
  over: boolean;
  result: "win" | "loss" | null;
  endReason: string;
}

/** Player input for one step. `down`/`up` are the attack press and release. */
export interface RushInput { down?: boolean; up?: boolean; block?: boolean; special?: boolean; swap?: number; pick?: number }

export type RushEvent =
  | { kind: "hit"; from: Side; to: Side; dmg: number; crit: boolean; effect: "super" | "weak" | null; selfHit: boolean; charge: number; block: BlockGrade | null; move: "attack" | "special" | "counter" }
  | { kind: "heal"; side: Side; amount: number }
  | { kind: "thorns"; side: Side; dmg: number }
  | { kind: "burn"; side: Side; dmg: number }
  | { kind: "ko"; side: Side; id: string }
  | { kind: "windup" }
  | { kind: "block"; grade: BlockGrade | "whiff" }
  | { kind: "chargeBroken" }
  | { kind: "special"; side: Side; type: AbilityType }
  | { kind: "swap"; side: Side; id: string }
  | { kind: "needPick" }
  | { kind: "end"; win: boolean; reason: string };

const SIDES: Side[] = ["mine", "theirs"];
const other = (s: Side): Side => (s === "mine" ? "theirs" : "mine");
const toFighter = (c: Card): Fighter => ({ ...c, els: [...c.els], ab: { ...c.ab }, look: { ...c.look }, hp: c.maxHp });
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const newSide = (team: Fighter[]): RushSide => ({ team, active: 0, bar: 0, special: 0, swapCd: 0, burnMs: 0, burnTickMs: 0, burnDmg: 0, shieldMs: 0, thornsMs: 0 });

export function createRush(party: Card[], opp: Opponent, rng: Rng = Math.random): RushState {
  return {
    opp,
    t: 0,
    mine: newSide(party.map(toFighter)),
    theirs: newSide(randomMonsters(TEAM_SIZE, rng, opp.mult).map(toFighter)),
    holding: false,
    chargeMs: 0,
    wind: null,
    blockCd: 0,
    needPick: false,
    ai: { thinkMs: 2500, specialAt: null },
    over: false,
    result: null,
    endReason: "",
  };
}

export const active = (x: RushSide) => x.team[x.active];
export const fillMs = (f: Fighter) => clamp(3300 - 200 * f.spd, 1400, 3200) * (f.ab.type === "quick" ? 0.8 : 1);
export const chargeLevel = (s: RushState) => s.chargeMs / RUSH.chargeMs;
export const canSwap = (x: RushSide, i: number) => x.swapCd <= 0 && i !== x.active && !!x.team[i] && x.team[i].hp > 0;

/** Advances the battle by `dt` ms after applying the player's input. */
export function step(s: RushState, dt: number, inp: RushInput, T: Tuning, rng: Rng): RushEvent[] {
  const ev: RushEvent[] = [];
  if (s.over) return ev;
  if (s.needPick) {
    const i = inp.pick;
    if (i !== undefined && s.mine.team[i]?.hp > 0) { field(s, "mine", i, ev); s.needPick = false; }
    return ev;
  }

  if (inp.swap !== undefined && canSwap(s.mine, inp.swap)) swap(s, "mine", inp.swap, ev);
  if (inp.special) useSpecial(s, "mine", T, rng, ev);
  if (!settle(s, T, rng, ev)) return ev;
  if (inp.block) block(s, ev);
  if (inp.down) s.holding = true;
  if (inp.up) {
    if (s.holding && s.mine.bar >= 1) attack(s, "mine", T, rng, ev, null);
    s.holding = false;
    s.chargeMs = 0;
  }
  if (!settle(s, T, rng, ev)) return ev;

  s.t += dt;
  s.blockCd = Math.max(0, s.blockCd - dt);
  for (const side of SIDES) {
    const x = s[side];
    x.swapCd = Math.max(0, x.swapCd - dt);
    x.shieldMs = Math.max(0, x.shieldMs - dt);
    x.thornsMs = Math.max(0, x.thornsMs - dt);
    if (x.bar < 1) x.bar = Math.min(1, x.bar + dt / fillMs(active(x)));
    if (x.burnMs > 0) {
      x.burnMs -= dt;
      x.burnTickMs -= dt;
      if (x.burnTickMs <= 0) {
        x.burnTickMs += RUSH.burnTickMs;
        const f = active(x);
        let dmg = x.burnDmg;
        if (T.alwaysWin) dmg = side === "mine" ? 0 : f.hp;
        f.hp = Math.max(0, f.hp - dmg);
        ev.push({ kind: "burn", side, dmg });
        if (f.hp <= 0) ev.push({ kind: "ko", side, id: f.id });
      }
    }
  }
  if (s.holding && s.mine.bar >= 1) s.chargeMs = Math.min(RUSH.chargeMs, s.chargeMs + dt);
  if (!settle(s, T, rng, ev)) return ev;

  enemyAI(s, dt, T, rng, ev);
  if (!settle(s, T, rng, ev)) return ev;

  if (s.wind) {
    s.wind.ms += dt;
    if (s.wind.ms >= RUSH.windMs) {
      const g = s.wind.block;
      s.wind = null;
      attack(s, "theirs", T, rng, ev, g);
      if (g === "perfect" && active(s.mine).hp > 0 && active(s.theirs).hp > 0) hit(s, "mine", RUSH.counterPower, { move: "counter" }, T, rng, ev);
    }
  } else if (s.theirs.bar >= 1) {
    s.wind = { ms: 0, block: null };
    ev.push({ kind: "windup" });
  }
  if (!settle(s, T, rng, ev)) return ev;

  if (s.t >= RUSH.timeLimitMs) {
    const myKOs = koCount(s.theirs.team), theirKOs = koCount(s.mine.team);
    const win = myKOs !== theirKOs ? myKOs > theirKOs : hpShare(s.mine.team) >= hpShare(s.theirs.team);
    end(s, win, myKOs !== theirKOs ? "time up, decided by knockouts" : "time up, decided by remaining HP", ev);
  }
  return ev;
}

/** Handles knockouts. Returns false when the step should stop: the battle ended or the player must pick. */
function settle(s: RushState, T: Tuning, rng: Rng, ev: RushEvent[]): boolean {
  if (s.over) return false;
  const mineDown = active(s.mine).hp <= 0, theirDown = active(s.theirs).hp <= 0;
  if (!mineDown && !theirDown) return true;
  const myKOs = koCount(s.theirs.team), theirKOs = koCount(s.mine.team);
  const iWin = myKOs >= T.kosToWin || s.theirs.team.every(f => f.hp <= 0);
  const theyWin = theirKOs >= T.kosToWin || s.mine.team.every(f => f.hp <= 0);
  if (iWin || theyWin) {
    const win = iWin && !theyWin ? true : theyWin && !iWin ? false : hpShare(s.mine.team) >= hpShare(s.theirs.team);
    end(s, win, "knockouts", ev);
    return false;
  }
  if (theirDown) {
    s.wind = null;
    field(s, "theirs", enemyNext(s, rng), ev);
  }
  if (mineDown) {
    s.wind = null;
    s.holding = false;
    s.chargeMs = 0;
    s.theirs.bar = Math.min(s.theirs.bar, 0.5);
    s.needPick = true;
    ev.push({ kind: "needPick" });
    return false;
  }
  return true;
}

function end(s: RushState, win: boolean, reason: string, ev: RushEvent[]) {
  s.over = true;
  s.result = win ? "win" : "loss";
  s.endReason = reason;
  s.wind = null;
  s.holding = false;
  ev.push({ kind: "end", win, reason });
}

function field(s: RushState, side: Side, i: number, ev: RushEvent[]) {
  const x = s[side];
  x.active = i;
  x.bar = 0;
  x.burnMs = 0;
  x.shieldMs = 0;
  x.thornsMs = 0;
  ev.push({ kind: "swap", side, id: x.team[i].id });
}

function swap(s: RushState, side: Side, i: number, ev: RushEvent[]) {
  field(s, side, i, ev);
  s[side].swapCd = RUSH.swapCdMs;
  if (side === "mine") { s.holding = false; s.chargeMs = 0; }
  else s.wind = null;
}

function block(s: RushState, ev: RushEvent[]) {
  if (s.blockCd > 0) return;
  if (!s.wind) {
    s.blockCd = RUSH.whiffCdMs;
    ev.push({ kind: "block", grade: "whiff" });
    return;
  }
  if (s.wind.block) return;
  s.wind.block = RUSH.windMs - s.wind.ms <= RUSH.perfectMs ? "perfect" : "half";
  ev.push({ kind: "block", grade: s.wind.block });
}

/** A normal attack from a full bar. Player attacks use the current charge. */
function attack(s: RushState, from: Side, T: Tuning, rng: Rng, ev: RushEvent[], blk: BlockGrade | null) {
  const a = active(s[from]);
  const charge = from === "mine" ? chargeLevel(s) : 0;
  const power = 1 + (RUSH.chargeMax - 1) * charge;
  const hits = a.ab.type === "double" ? 2 : 1;
  s[from].bar = 0;
  if (from === "mine") { s.holding = false; s.chargeMs = 0; }
  for (let h = 0; h < hits; h++) {
    if (a.hp <= 0 || active(s[other(from)]).hp <= 0) break;
    hit(s, from, power * (hits === 2 ? 0.6 : 1), { move: "attack", passive: true, charge, block: blk }, T, rng, ev);
  }
  if (a.ab.type === "heal" && a.hp > 0) heal(a, from, Math.round(a.ab.v * RUSH.dmgScale), ev);
}

interface HitOpts { move: "attack" | "special" | "counter"; passive?: boolean; charge?: number; block?: BlockGrade | null; forceCrit?: boolean; selfChance?: number; drain?: number }

function hit(s: RushState, from: Side, power: number, o: HitOpts, T: Tuning, rng: Rng, ev: RushEvent[]) {
  const ax = s[from], a = active(ax), d = active(s[other(from)]);
  const selfChance = o.selfChance ?? (o.passive && a.ab.type === "clumsy" ? 0.3 : 0);
  const selfHit = selfChance > 0 && rng() < selfChance;
  const target = selfHit ? a : d;
  const to = selfHit ? from : other(from);
  const tx = s[to];
  const mult = selfHit ? 1 : elementMultiplier(a.els, target.els);
  let dmg = a.atk * T.dmgMult * RUSH.dmgScale * power * mult * between(rng, 0.9, 1.1);
  const crit = !selfHit && (!!o.forceCrit || (!!o.passive && a.ab.type === "crit" && rng() < 0.3));
  if (crit) dmg *= 2;
  if (o.passive && a.ab.type === "burn") dmg += a.ab.v * RUSH.dmgScale;
  const blk = selfHit ? null : o.block ?? null;
  if (!selfHit) {
    if (target.ab.type === "shield") dmg -= target.ab.v * RUSH.dmgScale;
    if (tx.shieldMs > 0) dmg *= 1 - RUSH.shieldCut;
    if (blk === "half") dmg *= 0.5;
  }
  dmg = blk === "perfect" ? 0 : Math.max(1, Math.round(dmg));
  if (T.alwaysWin) dmg = to === "mine" ? 0 : Math.max(dmg, target.hp);
  target.hp = Math.max(0, target.hp - dmg);
  ev.push({ kind: "hit", from, to, dmg, crit, effect: selfHit ? null : mult > 1 ? "super" : mult < 1 ? "weak" : null, selfHit, charge: o.charge ?? 0, block: blk, move: o.move });

  if (!selfHit && dmg > 0) {
    ax.special = Math.min(1, ax.special + (dmg / target.maxHp) * RUSH.meterDealt);
    tx.special = Math.min(1, tx.special + (dmg / target.maxHp) * RUSH.meterTaken);
  }
  if (to === "mine" && !selfHit && blk !== "perfect" && s.holding) {
    if (s.chargeMs > 0) ev.push({ kind: "chargeBroken" });
    s.holding = false;
    s.chargeMs = 0;
  }
  const drain = o.drain ?? (o.passive && a.ab.type === "drain" ? 0.5 : 0);
  if (!selfHit && drain && dmg > 0 && a.hp > 0) heal(a, from, Math.round(dmg * drain), ev);
  if (!selfHit && a.hp > 0 && !(T.alwaysWin && from === "mine")) {
    let th = 0;
    if (target.ab.type === "thorns") th += Math.max(1, Math.round(target.ab.v * RUSH.dmgScale));
    if (tx.thornsMs > 0) th += Math.round(dmg * RUSH.thornsShare);
    if (th > 0) {
      a.hp = Math.max(0, a.hp - th);
      ev.push({ kind: "thorns", side: from, dmg: th });
    }
  }
  if (target.hp <= 0) ev.push({ kind: "ko", side: to, id: target.id });
  if (a.hp <= 0 && target !== a) ev.push({ kind: "ko", side: from, id: a.id });
}

function heal(f: Fighter, side: Side, amount: number, ev: RushEvent[]) {
  const gain = Math.min(f.maxHp - f.hp, amount);
  if (gain <= 0) return;
  f.hp += gain;
  ev.push({ kind: "heal", side, amount: gain });
}

function useSpecial(s: RushState, side: Side, T: Tuning, rng: Rng, ev: RushEvent[]) {
  const x = s[side];
  if (x.special < 1) return;
  const a = active(x);
  x.special = 0;
  ev.push({ kind: "special", side, type: a.ab.type });
  const strike = (power: number, o: Partial<HitOpts> = {}) => {
    if (a.hp > 0 && active(s[other(side)]).hp > 0) hit(s, side, power, { move: "special", ...o }, T, rng, ev);
  };
  switch (a.ab.type) {
    case "burn": {
      strike(1);
      const ox = s[other(side)];
      if (active(ox).hp > 0) {
        ox.burnMs = RUSH.burnMs;
        ox.burnTickMs = RUSH.burnTickMs;
        ox.burnDmg = Math.max(1, Math.round(a.atk * T.dmgMult * RUSH.dmgScale * 0.35));
      }
      break;
    }
    case "heal": heal(a, side, Math.round(a.maxHp * 0.4), ev); break;
    case "double": for (let i = 0; i < 3; i++) strike(0.6); break;
    case "shield": x.shieldMs = RUSH.buffMs; break;
    case "quick": strike(1); x.bar = 1; break;
    case "drain": strike(1.2, { drain: 0.8 }); break;
    case "thorns": x.thornsMs = RUSH.buffMs; break;
    case "crit": strike(1, { forceCrit: true }); break;
    case "clumsy": strike(2.6, { selfChance: 0.4 }); break;
  }
}

/** Enemy replacement after a KO: healthy monsters with a good matchup first, with some noise. */
function enemyNext(s: RushState, rng: Rng): number {
  const foe = active(s.mine);
  let best = -1, bestScore = -Infinity;
  s.theirs.team.forEach((f, i) => {
    if (f.hp <= 0) return;
    const sc = f.hp / f.maxHp + (elementMultiplier(f.els, foe.els) > 1 ? 0.3 : 0) - (elementMultiplier(foe.els, f.els) > 1 ? 0.3 : 0) + rng() * 0.4;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return best;
}

/** The enemy always winds up as soon as its bar fills (see `step`). Here: specials and the odd swap. */
function enemyAI(s: RushState, dt: number, T: Tuning, rng: Rng, ev: RushEvent[]) {
  const x = s.theirs, me = active(x), foe = active(s.mine);
  if (x.special >= 1 && !s.wind) {
    if (s.ai.specialAt === null) s.ai.specialAt = s.t + between(rng, 400, 1600);
    if (s.t >= s.ai.specialAt && (me.ab.type !== "heal" || me.hp < me.maxHp * 0.6)) {
      s.ai.specialAt = null;
      useSpecial(s, "theirs", T, rng, ev);
      return;
    }
  }
  s.ai.thinkMs -= dt;
  if (s.ai.thinkMs > 0) return;
  s.ai.thinkMs = 2500;
  if (s.wind || x.swapCd > 0 || elementMultiplier(foe.els, me.els) <= 1 || rng() >= 0.4) return;
  const alt = x.team.findIndex((f, i) => i !== x.active && f.hp > 0 && elementMultiplier(foe.els, f.els) <= 1);
  if (alt >= 0) swap(s, "theirs", alt, ev);
}

/* ---------- Simulated player ---------- */

export interface RushSkill {
  /** Delay before attacking once the bar is full, ms range. */
  react: [number, number];
  /** Per wind-up: chance of a perfect block, and of a half block. */
  perfect: number;
  half: number;
  /** Chance to charge an attack, and to release a charge early when the enemy winds up. */
  charge: number;
  release: number;
  /** Delay before firing a full special, ms. */
  specialDelay: number;
  /** Chance per second of swapping out of a bad element matchup. */
  swaps: number;
}

export const RUSH_SKILL = {
  none: { react: [100, 250], perfect: 0, half: 0, charge: 0, release: 0, specialDelay: 0, swaps: 0 },
  casual: { react: [250, 600], perfect: 0.15, half: 0.45, charge: 0.35, release: 0.4, specialDelay: 1500, swaps: 0.3 },
  skilled: { react: [100, 250], perfect: 0.45, half: 0.4, charge: 0.8, release: 0.9, specialDelay: 200, swaps: 1 },
} satisfies Record<string, RushSkill>;

export interface RushBot { attackAt: number | null; plan: "tap" | "charge"; sawWind: boolean; blockAt: number | null; specialAt: number | null; nextSwapCheck: number }
export const newRushBot = (): RushBot => ({ attackAt: null, plan: "tap", sawWind: false, blockAt: null, specialAt: null, nextSwapCheck: 0 });

const matchScore = (m: Fighter, t: Fighter) =>
  elementMultiplier(m.els, t.els) * m.atk - 0.6 * elementMultiplier(t.els, m.els) * t.atk + 10 * (m.hp / m.maxHp);

export function botInput(s: RushState, m: RushBot, k: RushSkill, rng: Rng): RushInput {
  const inp: RushInput = {};
  const foe = active(s.theirs);
  if (s.needPick) {
    let best = -1;
    s.mine.team.forEach((f, i) => { if (f.hp > 0 && (best < 0 || matchScore(f, foe) > matchScore(s.mine.team[best], foe))) best = i; });
    inp.pick = best;
    m.attackAt = null;
    return inp;
  }

  if (s.wind && !m.sawWind) {
    m.sawWind = true;
    const r = rng();
    m.blockAt = r < k.perfect ? RUSH.windMs - between(rng, 15, RUSH.perfectMs - 15) : r < k.perfect + k.half ? between(rng, 150, RUSH.windMs - RUSH.perfectMs - 20) : null;
    if (s.holding && rng() < k.release) inp.up = true;
  }
  if (!s.wind) { m.sawWind = false; m.blockAt = null; }
  if (s.wind && m.blockAt !== null && s.wind.ms >= m.blockAt) { inp.block = true; m.blockAt = null; }

  if (s.mine.bar >= 1 && !inp.up) {
    if (m.attackAt === null) {
      m.attackAt = s.t + between(rng, k.react[0], k.react[1]);
      m.plan = rng() < k.charge ? "charge" : "tap";
    }
    if (s.t >= m.attackAt) {
      if (m.plan === "tap" || (s.wind && !s.holding)) { inp.down = true; inp.up = true; m.attackAt = null; }
      else if (!s.holding && !s.wind) inp.down = true;
      else if (s.chargeMs >= RUSH.chargeMs) { inp.up = true; m.attackAt = null; }
    }
  } else if (s.mine.bar < 1) m.attackAt = null;

  if (s.mine.special >= 1) {
    if (m.specialAt === null) m.specialAt = s.t + k.specialDelay;
    const me = active(s.mine);
    if (s.t >= m.specialAt && (me.ab.type !== "heal" || me.hp < me.maxHp * 0.6 || k.swaps < 1)) { inp.special = true; m.specialAt = null; }
  }

  if (k.swaps > 0 && s.t >= m.nextSwapCheck) {
    m.nextSwapCheck = s.t + 1000;
    if (rng() >= k.swaps) return inp;
    const me = active(s.mine);
    if (!s.wind && !s.holding && s.mine.swapCd <= 0 && elementMultiplier(foe.els, me.els) > 1) {
      const alt = s.mine.team.findIndex((f, i) => i !== s.mine.active && f.hp > f.maxHp * 0.3 && elementMultiplier(foe.els, f.els) <= 1);
      if (alt >= 0) { inp.swap = alt; m.attackAt = null; }
    }
  }
  return inp;
}

export function simulateRush(party: Card[], opp: Opponent, T: Tuning, skill: RushSkill, rng: Rng, dt = 20): RushState {
  const s = createRush(party, opp, rng);
  const bot = newRushBot();
  for (let guard = 0; !s.over && guard < 1e6; guard++) step(s, dt, botInput(s, bot, skill, rng), T, rng);
  return s;
}
