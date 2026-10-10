/**
 * "Hand" battle prototype: action cards with visible enemy intents (in the style of Slay the Spire).
 *
 * Rules:
 * - All three of your monsters and all three enemies are on the field. There are no timing taps.
 * - Your action deck comes from your party. Each monster adds 2 Strike (cost 1), 1 Guard (cost 1, block
 *   on any ally) and 1 ability card built from its ability (see ABILITY_CARDS).
 * - Each turn: 3 energy, draw 5, play cards, then End turn. The rest of the hand is discarded. The discard
 *   pile is shuffled back in when the draw pile runs out. Your block resets at the start of your turn.
 * - A knocked-out monster's cards stay in the deck as Fainted cards that cannot be played.
 * - Every enemy shows its intent (attack a target, guard, charge, heal) before you act. Intents favour
 *   good element matchups and wounded targets. Enemy block lasts until the start of their next phase.
 * - Enemy phase order: burn ticks, enemy block resets, each enemy acts left to right, new intents.
 * - Element multipliers as in Classic. Enemy Shell (shield) and Thorns stay passive, as in Classic.
 * - HP on both sides is scaled by HP_MULT so a battle lasts several turns. Enemy HP is also divided by
 *   opp.mult ** ENEMY_HP_DAMP, because opponents scale both HP and ATK and the ladder was too steep.
 * - Damage has no random roll, so the numbers on cards and intents are exact (Wild Swing's self-hit
 *   chance is the only luck after intents are shown).
 * - Win at `T.kosToWin` knockouts or when the other team is out. After TURN_LIMIT turns the side with
 *   more knockouts wins, then the higher share of remaining HP.
 * - Tuning: `dmgMult` scales all damage. `alwaysWin` makes enemies deal 0 damage to you and makes any
 *   damaging card knock out its target.
 */
import type { AbilityType, Card, Opponent, Rng, Tuning } from "../../types.js";
import { TEAM_SIZE, randomMonsters } from "../../data/cards.js";
import { elementMultiplier } from "../../data/elements.js";
import { between } from "../../rng.js";

export const HP_MULT = 2.5;
export const ENERGY = 3;
export const HAND_SIZE = 5;
export const TURN_LIMIT = 10;
const STRIKE_K = 0.9;
const GUARD_K = 0.16;
const ENEMY_K = 0.7;
/** Enemy HP is divided by opp.mult ** this, so the ladder ramps less steeply than mult squared. */
const ENEMY_HP_DAMP = 0.85;
const ENEMY_GUARD_K = 0.12;

export type Target = "enemy" | "ally" | "self";
export type CardKind = "strike" | "guard" | "ability";

export interface ActionCard { uid: number; owner: string; kind: CardKind; ab: AbilityType | null; cost: number; fainted: boolean }

export type Intent =
  | { kind: "attack"; target: string; base: number; hits: number }
  | { kind: "guard"; amount: number }
  | { kind: "charge" }
  | { kind: "heal"; target: string; amount: number };

export interface HFighter extends Card {
  /** The card as it was before this mode scaled its HP; rewards come from here. */
  card: Card;
  hp: number;
  block: number;
  /** Burn damage per enemy phase and phases left. */
  burn: number;
  burnTurns: number;
  /** Damage dealt back to each attacker this enemy phase. */
  thorns: number;
  charged: boolean;
  intent: Intent | null;
  last: Intent["kind"] | null;
}

export interface HandState {
  opp: Opponent;
  mine: HFighter[];
  theirs: HFighter[];
  draw: ActionCard[];
  hand: ActionCard[];
  discard: ActionCard[];
  energy: number;
  turn: number;
  phase: "player" | "enemy" | "over";
  result: "win" | "loss" | null;
  endReason: string;
  reshuffles: number;
}

export type HandEvent =
  | { kind: "hit"; from: string; to: string; dmg: number; blocked: number; effect: "super" | "weak" | null; selfHit?: boolean }
  | { kind: "block"; id: string; amount: number }
  | { kind: "heal"; id: string; amount: number }
  | { kind: "burn"; id: string; dmg: number }
  | { kind: "thorns"; id: string; dmg: number }
  | { kind: "charge"; id: string }
  | { kind: "status"; id: string; text: string }
  | { kind: "ko"; id: string; mine: boolean }
  | { kind: "reshuffle" };

/** Ability cards. `k` multiplies the owner's Strike damage per hit. */
export const ABILITY_CARDS: Record<AbilityType, { name: string; cost: number; target: Target; hits?: number; k?: number }> = {
  burn: { name: "Fire Breath", cost: 1, target: "enemy", k: 0.5 },
  heal: { name: "Regrow", cost: 1, target: "ally" },
  double: { name: "Double Strike", cost: 1, target: "enemy", hits: 2, k: 0.7 },
  shield: { name: "Shell Up", cost: 1, target: "self" },
  quick: { name: "Quick Jab", cost: 0, target: "enemy", k: 0.6 },
  drain: { name: "Drain", cost: 1, target: "enemy", k: 0.9 },
  thorns: { name: "Spikes", cost: 1, target: "self" },
  crit: { name: "Lucky Blow", cost: 2, target: "enemy", k: 2.6 },
  clumsy: { name: "Wild Swing", cost: 1, target: "enemy", k: 2 },
};
const CLUMSY_SELF = 0.3;
const burnPerTurn = (v: number) => 2 + v;
const BURN_TURNS = 3;
const healAmount = (v: number) => 8 + 2 * v;
const thornsAmount = (v: number) => 4 + 2 * v;

const shuffle = <T>(list: T[], rng: Rng) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const toFighter = (c: Card, hpScale = HP_MULT): HFighter => ({
  ...c, card: c, els: [...c.els], ab: { ...c.ab }, look: { ...c.look },
  maxHp: Math.round(c.maxHp * hpScale), hp: Math.round(c.maxHp * hpScale),
  block: 0, burn: 0, burnTurns: 0, thorns: 0, charged: false, intent: null, last: null,
});

export function createHand(party: Card[], opp: Opponent, T: Tuning, rng: Rng): HandState {
  const mine = party.map(c => toFighter(c));
  let uid = 1;
  const deck: ActionCard[] = [];
  for (const m of mine) {
    const add = (kind: CardKind, cost: number, ab: AbilityType | null = null) => deck.push({ uid: uid++, owner: m.id, kind, ab, cost, fainted: false });
    add("strike", 1); add("strike", 1); add("guard", 1);
    add("ability", ABILITY_CARDS[m.ab.type].cost, m.ab.type);
  }
  const s: HandState = {
    opp, mine,
    theirs: randomMonsters(TEAM_SIZE, rng, opp.mult).map(c => toFighter(c, HP_MULT * opp.mult ** -ENEMY_HP_DAMP)),
    draw: shuffle(deck, rng), hand: [], discard: [],
    energy: 0, turn: 0, phase: "player", result: null, endReason: "", reshuffles: 0,
  };
  chooseIntents(s, T, rng);
  startPlayerTurn(s, rng);
  return s;
}

export const alive = (list: HFighter[]) => list.filter(f => f.hp > 0);
export const koCount = (list: HFighter[]) => list.filter(f => f.hp <= 0).length;
export const hpShare = (list: HFighter[]) => list.reduce((a, f) => a + Math.max(0, f.hp), 0) / list.reduce((a, f) => a + f.maxHp, 0);
export const findFighter = (s: HandState, id: string) => s.mine.find(f => f.id === id) ?? s.theirs.find(f => f.id === id);
export const ownerOf = (s: HandState, c: ActionCard) => s.mine.find(f => f.id === c.owner)!;

/* ---------- Player cards ---------- */

export const cardTarget = (c: ActionCard): Target => (c.kind === "strike" ? "enemy" : c.kind === "guard" ? "ally" : ABILITY_CARDS[c.ab!].target);
export const cardName = (c: ActionCard) => (c.fainted ? "Fainted" : c.kind === "strike" ? "Strike" : c.kind === "guard" ? "Guard" : ABILITY_CARDS[c.ab!].name);

/** Ids of everything this card may target right now. Self cards return the owner. */
export function validTargets(s: HandState, c: ActionCard): string[] {
  const t = cardTarget(c);
  if (t === "enemy") return alive(s.theirs).map(f => f.id);
  if (t === "ally") return alive(s.mine).map(f => f.id);
  return [c.owner];
}

/** Why the card cannot be played, or null if it can. */
export function cannotPlay(s: HandState, c: ActionCard): string | null {
  if (s.phase !== "player") return "Not your turn";
  if (!s.hand.includes(c)) return "Not in hand";
  if (c.fainted || ownerOf(s, c).hp <= 0) return "Its monster has fainted";
  if (c.cost > s.energy) return "Not enough energy";
  return null;
}

const strikeBase = (o: HFighter, T: Tuning) => o.atk * STRIKE_K * T.dmgMult;
const guardAmount = (o: HFighter) => Math.round(o.maxHp * GUARD_K);
const shieldAmount = (o: HFighter) => Math.round(o.maxHp * GUARD_K * 2) + o.ab.v;

/** Per-hit damage and hit count before the target's shell and block. */
export function cardDamage(s: HandState, c: ActionCard, targetId: string | null, T: Tuning) {
  const o = ownerOf(s, c);
  const k = c.kind === "strike" ? 1 : c.kind === "ability" ? ABILITY_CARDS[c.ab!].k ?? 0 : 0;
  const hits = c.kind === "ability" ? ABILITY_CARDS[c.ab!].hits ?? 1 : 1;
  const t = targetId ? findFighter(s, targetId) : undefined;
  const mult = t ? elementMultiplier(o.els, t.els) : 1;
  return { dmg: k ? Math.max(1, Math.round(strikeBase(o, T) * k * mult)) : 0, hits, mult };
}

/** A few characters for the face of the card, e.g. "13", "2×9", "Block 11". */
export function cardShort(s: HandState, c: ActionCard, targetId: string | null, T: Tuning): string {
  if (c.fainted) return "";
  const o = ownerOf(s, c);
  const { dmg, hits } = cardDamage(s, c, targetId, T);
  if (c.kind === "guard") return `Block ${guardAmount(o)}`;
  if (c.ab === "heal") return `Heal ${healAmount(o.ab.v)}`;
  if (c.ab === "shield") return `Block ${shieldAmount(o)}`;
  if (c.ab === "thorns") return `Spikes ${thornsAmount(Math.max(o.ab.v, 1))}`;
  if (c.ab === "burn") return `${dmg}+Burn`;
  return hits > 1 ? `${hits}×${dmg}` : `${dmg}`;
}

/** Damage your monster will take from the shown intents, before block. */
export function incomingDamage(s: HandState, id: string, T: Tuning) {
  return incoming(s, T, true).get(id) ?? 0;
}

/** What the card does, in plain words. With a target, numbers include the element bonus. */
export function cardText(s: HandState, c: ActionCard, targetId: string | null, T: Tuning): string {
  if (c.fainted) return "Its monster fainted. This card cannot be played.";
  const o = ownerOf(s, c);
  const t = targetId ? findFighter(s, targetId) : undefined;
  const { dmg, hits, mult } = cardDamage(s, c, targetId, T);
  const who = t ? t.name : "one enemy";
  const ally = t ? t.name : "one ally";
  const deal = hits > 1 ? `Hit ${who} ${hits} times for ${dmg}` : `Deal ${dmg} to ${who}`;
  let el = t && mult > 1 ? " Super effective!" : t && mult < 1 ? " Not very effective." : "";
  if (t && s.theirs.includes(t) && dmg) {
    if (t.ab.type === "shield") el += ` Its shell blocks ${t.ab.v} a hit.`;
    if (t.block) el += ` It has ${t.block} block.`;
    if (t.ab.type === "thorns") el += ` Thorns hurt ${o.name} for ${t.ab.v}.`;
  }
  if (c.kind === "strike") return deal + "." + el;
  if (c.kind === "guard") return `Give ${ally} ${guardAmount(o)} block.`;
  const v = o.ab.v;
  switch (c.ab!) {
    case "burn": return `${deal}, then burn it for ${burnPerTurn(v)} a turn for ${BURN_TURNS} turns.${el}`;
    case "heal": return `Heal ${ally} ${healAmount(v)} HP.`;
    case "double": return `${deal}.${el}`;
    case "shield": return `${o.name} gains ${shieldAmount(o)} block.`;
    case "quick": return `Free: ${deal[0].toLowerCase()}${deal.slice(1)}.${el}`;
    case "drain": return `${deal}. ${o.name} heals the damage dealt.${el}`;
    case "thorns": return `${o.name} gains ${guardAmount(o)} block and hurts each attacker for ${thornsAmount(Math.max(v, 1))} this turn.`;
    case "crit": return `Guaranteed critical: ${deal[0].toLowerCase()}${deal.slice(1)}.${el}`;
    case "clumsy": return `${deal}. ${Math.round(CLUMSY_SELF * 100)}% chance ${o.name} hits itself instead.${el}`;
  }
}

/** Deals one hit to an enemy from a player card. */
function hitEnemy(s: HandState, from: HFighter, t: HFighter, raw: number, mult: number, T: Tuning, ev: HandEvent[]) {
  if (t.hp <= 0) return 0;
  let dmg = raw;
  if (t.ab.type === "shield") dmg = Math.max(1, dmg - t.ab.v);
  let blocked = Math.min(t.block, dmg);
  if (T.alwaysWin) { blocked = 0; dmg = t.hp; t.block = 0; }
  t.block -= blocked;
  const lost = Math.min(t.hp, dmg - blocked);
  t.hp -= lost;
  ev.push({ kind: "hit", from: from.id, to: t.id, dmg: lost, blocked, effect: mult > 1 ? "super" : mult < 1 ? "weak" : null });
  if (t.ab.type === "thorns" && from.hp > 0) hurtMine(s, from, t.ab.v, T, ev, "thorns");
  if (t.hp <= 0) knockOut(s, t, ev);
  return lost;
}

/** Damage to one of your monsters that ignores block (thorns, self-hits). */
function hurtMine(s: HandState, m: HFighter, dmg: number, T: Tuning, ev: HandEvent[], kind: "thorns" | "self") {
  const d = T.alwaysWin ? 0 : Math.min(m.hp, dmg);
  m.hp -= d;
  if (kind === "thorns") ev.push({ kind: "thorns", id: m.id, dmg: d });
  else ev.push({ kind: "hit", from: m.id, to: m.id, dmg: d, blocked: 0, effect: null, selfHit: true });
  if (m.hp <= 0) knockOut(s, m, ev);
}

function knockOut(s: HandState, f: HFighter, ev: HandEvent[]) {
  f.hp = 0; f.block = 0; f.thorns = 0; f.burn = 0; f.burnTurns = 0; f.intent = null; f.charged = false;
  const mine = s.mine.includes(f);
  if (mine) for (const c of [...s.draw, ...s.hand, ...s.discard]) if (c.owner === f.id) c.fainted = true;
  ev.push({ kind: "ko", id: f.id, mine });
}

/** Plays a card from the hand. Throws if it cannot be played or the target is invalid. */
export function playCard(s: HandState, c: ActionCard, targetId: string | null, T: Tuning, rng: Rng): HandEvent[] {
  const why = cannotPlay(s, c);
  if (why) throw new Error(why);
  const targets = validTargets(s, c);
  const tid = cardTarget(c) === "self" ? c.owner : targetId;
  if (!tid || !targets.includes(tid)) throw new Error("Invalid target");
  const o = ownerOf(s, c), t = findFighter(s, tid)!;
  s.energy -= c.cost;
  s.hand.splice(s.hand.indexOf(c), 1);
  s.discard.push(c);
  const ev: HandEvent[] = [];
  const { dmg, hits, mult } = cardDamage(s, c, tid, T);
  const v = o.ab.v;
  if (c.kind === "guard") gainBlock(t, guardAmount(o), ev);
  else if (c.kind === "strike") hitEnemy(s, o, t, dmg, mult, T, ev);
  else switch (c.ab!) {
    case "heal": heal(t, healAmount(v), ev); break;
    case "shield": gainBlock(o, shieldAmount(o), ev); break;
    case "thorns":
      gainBlock(o, guardAmount(o), ev);
      o.thorns += thornsAmount(Math.max(v, 1));
      ev.push({ kind: "status", id: o.id, text: `Spikes ${o.thorns}` });
      break;
    case "clumsy":
      if (rng() < CLUMSY_SELF) hurtMine(s, o, Math.round(strikeBase(o, T)), T, ev, "self");
      else hitEnemy(s, o, t, dmg, mult, T, ev);
      break;
    default: {
      let total = 0;
      for (let h = 0; h < hits && o.hp > 0; h++) total += hitEnemy(s, o, t, dmg, mult, T, ev);
      if (c.ab === "drain" && o.hp > 0) heal(o, total, ev);
      if (c.ab === "burn" && t.hp > 0) {
        t.burn = Math.max(t.burn, burnPerTurn(v)); t.burnTurns = BURN_TURNS;
        ev.push({ kind: "status", id: t.id, text: `Burning ${t.burn}` });
      }
    }
  }
  checkEnd(s, T);
  return ev;
}

function gainBlock(f: HFighter, amount: number, ev: HandEvent[]) {
  f.block += amount;
  ev.push({ kind: "block", id: f.id, amount });
}
function heal(f: HFighter, amount: number, ev: HandEvent[]) {
  const gain = Math.min(f.maxHp - f.hp, amount);
  if (gain > 0) { f.hp += gain; ev.push({ kind: "heal", id: f.id, amount: gain }); }
}

/* ---------- Turn flow ---------- */

function drawCards(s: HandState, n: number, rng: Rng, ev: HandEvent[] = []) {
  for (let i = 0; i < n; i++) {
    if (!s.draw.length) {
      if (!s.discard.length) break;
      s.draw = shuffle(s.discard, rng);
      s.discard = [];
      s.reshuffles++;
      ev.push({ kind: "reshuffle" });
    }
    s.hand.push(s.draw.pop()!);
  }
  return ev;
}

function startPlayerTurn(s: HandState, rng: Rng) {
  s.turn++;
  s.phase = "player";
  s.energy = ENERGY;
  for (const m of s.mine) { m.block = 0; m.thorns = 0; }
  return drawCards(s, HAND_SIZE, rng);
}

/** Ends your turn: discards the hand, ticks burns and resets enemy block. Then call `enemyAct` for each enemy. */
export function beginEnemyPhase(s: HandState, T: Tuning): HandEvent[] {
  if (s.phase !== "player") throw new Error("Not your turn");
  s.discard.push(...s.hand);
  s.hand = [];
  s.phase = "enemy";
  const ev: HandEvent[] = [];
  for (const e of alive(s.theirs)) {
    e.block = 0;
    if (e.burnTurns > 0) {
      const d = Math.min(e.hp, Math.round(e.burn * T.dmgMult));
      e.hp -= d; e.burnTurns--;
      if (!e.burnTurns) e.burn = 0;
      ev.push({ kind: "burn", id: e.id, dmg: d });
      if (e.hp <= 0) knockOut(s, e, ev);
    }
  }
  checkEnd(s, T);
  return ev;
}

/** Per-hit damage an attack intent deals to a given target, before block. */
export function intentDamage(e: HFighter, intent: Extract<Intent, { kind: "attack" }>, target: HFighter, T: Tuning) {
  if (T.alwaysWin) return 0;
  return Math.max(1, Math.round(intent.base * elementMultiplier(e.els, target.els) * (e.charged ? 2 : 1)));
}

/** One enemy carries out its intent. */
export function enemyAct(s: HandState, id: string, T: Tuning, rng: Rng): HandEvent[] {
  const e = s.theirs.find(f => f.id === id);
  const ev: HandEvent[] = [];
  if (s.phase !== "enemy" || !e || e.hp <= 0 || !e.intent) return ev;
  const it = e.intent;
  e.last = it.kind;
  e.intent = null;
  if (it.kind === "guard") gainBlock(e, it.amount, ev);
  else if (it.kind === "charge") { e.charged = true; ev.push({ kind: "charge", id: e.id }); }
  else if (it.kind === "heal") heal(s.theirs.find(f => f.id === it.target && f.hp > 0) ?? e, it.amount, ev);
  else {
    let t = s.mine.find(f => f.id === it.target && f.hp > 0);
    if (!t) { const pick = pickTarget(s, e, rng); if (!pick) return ev; t = pick; }
    const per = intentDamage(e, it, t, T);
    const mult = elementMultiplier(e.els, t.els);
    for (let h = 0; h < it.hits && t.hp > 0 && e.hp > 0; h++) {
      const blocked = Math.min(t.block, per);
      t.block -= blocked;
      const lost = Math.min(t.hp, per - blocked);
      t.hp -= lost;
      ev.push({ kind: "hit", from: e.id, to: t.id, dmg: lost, blocked, effect: mult > 1 ? "super" : mult < 1 ? "weak" : null });
      if (e.ab.type === "drain" && lost > 0) heal(e, Math.round(lost / 2), ev);
      if (t.thorns > 0) {
        const d = Math.min(e.hp, Math.round(t.thorns * T.dmgMult));
        e.hp -= d;
        ev.push({ kind: "thorns", id: e.id, dmg: d });
        if (e.hp <= 0) knockOut(s, e, ev);
      }
      if (t.hp <= 0) knockOut(s, t, ev);
    }
    e.charged = false;
  }
  checkEnd(s, T);
  return ev;
}

/** After every enemy acted: checks the turn limit, picks new intents and starts your next turn. */
export function finishEnemyPhase(s: HandState, T: Tuning, rng: Rng): HandEvent[] {
  if (s.phase !== "enemy") return [];
  if (s.turn >= TURN_LIMIT) {
    const my = koCount(s.theirs), their = koCount(s.mine);
    const win = my !== their ? my > their : hpShare(s.mine) >= hpShare(s.theirs);
    end(s, win, my !== their ? "turn limit, decided by knockouts" : "turn limit, decided by remaining HP");
    return [];
  }
  chooseIntents(s, T, rng);
  return startPlayerTurn(s, rng);
}

/** Runs the whole enemy phase at once (for the simulator and tests). */
export function endTurn(s: HandState, T: Tuning, rng: Rng): HandEvent[] {
  const ev = beginEnemyPhase(s, T);
  for (const e of s.theirs) ev.push(...enemyAct(s, e.id, T, rng));
  ev.push(...finishEnemyPhase(s, T, rng));
  return ev;
}

function checkEnd(s: HandState, T: Tuning) {
  if (s.phase === "over") return;
  const iWin = koCount(s.theirs) >= T.kosToWin || !alive(s.theirs).length;
  const theyWin = koCount(s.mine) >= T.kosToWin || !alive(s.mine).length;
  if (!iWin && !theyWin) return;
  const win = iWin && !theyWin ? true : theyWin && !iWin ? false : hpShare(s.mine) >= hpShare(s.theirs);
  end(s, win, "knockouts");
}

export function end(s: HandState, win: boolean, reason: string) {
  s.phase = "over";
  s.result = win ? "win" : "loss";
  s.endReason = reason;
}

/* ---------- Enemy intents ---------- */

/** Favours targets the enemy hits hard and monsters that are already hurt. */
function pickTarget(s: HandState, e: HFighter, rng: Rng): HFighter | undefined {
  const score = (m: HFighter) => elementMultiplier(e.els, m.els) * 2 + (1 - m.hp / m.maxHp) * 1.5 + rng() * 1.3;
  return alive(s.mine).map(m => ({ m, v: score(m) })).sort((a, b) => b.v - a.v)[0]?.m;
}

export function chooseIntent(s: HandState, e: HFighter, T: Tuning, rng: Rng): Intent {
  const attack = (): Intent => {
    const t = pickTarget(s, e, rng)!;
    const hits = e.ab.type === "double" ? 2 : 1;
    const burn = e.ab.type === "burn" ? e.ab.v : 0;
    const base = (e.atk * ENEMY_K * (hits === 2 ? 0.6 : 1) + burn) * T.dmgMult * between(rng, 0.9, 1.1);
    return { kind: "attack", target: t.id, base, hits };
  };
  if (e.charged) return attack();
  const hurt = alive(s.theirs).filter(f => f.hp < f.maxHp * 0.75).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const opts: [number, () => Intent][] = [
    [6, attack],
    [e.last === "guard" ? 0.5 : 2, () => ({ kind: "guard", amount: Math.round(e.maxHp * ENEMY_GUARD_K) })],
    [e.last === "charge" ? 0 : e.ab.type === "crit" ? 2.5 : 1, () => ({ kind: "charge" })],
  ];
  if (e.ab.type === "heal" && hurt) opts.push([3, () => ({ kind: "heal", target: hurt.id, amount: healAmount(e.ab.v) * 2 })]);
  let r = rng() * opts.reduce((a, [w]) => a + w, 0);
  for (const [w, f] of opts) if ((r -= w) < 0) return f();
  return attack();
}

function chooseIntents(s: HandState, T: Tuning, rng: Rng) {
  for (const e of s.theirs) e.intent = e.hp > 0 ? chooseIntent(s, e, T, rng) : null;
}

/** The intent as plain text, e.g. "Attack 14 → Mossback". Escape before inserting as HTML. */
export function intentText(s: HandState, e: HFighter, T: Tuning): string {
  const it = e.intent;
  if (!it) return "";
  if (it.kind === "guard") return `Guard ${it.amount}`;
  if (it.kind === "charge") return "Charge: next attack ×2";
  if (it.kind === "heal") return `Heal ${it.amount} → ${findFighter(s, it.target)?.name ?? ""}`;
  const t = s.mine.find(f => f.id === it.target)!;
  const d = intentDamage(e, it, t, T);
  return `Attack ${it.hits > 1 ? `${it.hits}×` : ""}${d} → ${t.name}`;
}

/* ---------- Player bot ---------- */

export type HandSkill = "none" | "casual" | "skilled";
export const HAND_SKILLS: HandSkill[] = ["none", "casual", "skilled"];

/** Damage each of your monsters expects this enemy phase. Casual players spread the total evenly. */
function incoming(s: HandState, T: Tuning, readIntents: boolean): Map<string, number> {
  const out = new Map<string, number>();
  const mine = alive(s.mine);
  for (const m of mine) out.set(m.id, 0);
  if (readIntents) {
    for (const e of alive(s.theirs)) {
      const it = e.intent;
      if (it?.kind !== "attack") continue;
      const t = mine.find(m => m.id === it.target);
      if (t) out.set(t.id, out.get(t.id)! + intentDamage(e, it, t, T) * it.hits);
    }
  } else {
    const total = alive(s.theirs).reduce((a, e) => a + e.atk * ENEMY_K * T.dmgMult * 0.7, 0);
    for (const m of mine) out.set(m.id, T.alwaysWin ? 0 : total / mine.length);
  }
  return out;
}

/** Value of an enemy's coming action, used by skilled players to prioritise kills. */
function threat(e: HFighter, s: HandState, T: Tuning) {
  const it = e.intent;
  if (it?.kind !== "attack") return e.charged ? e.atk : 0;
  const t = s.mine.find(m => m.id === it.target);
  return t ? intentDamage(e, it, t, T) * it.hits : 0;
}

function evaluate(s: HandState, c: ActionCard, tid: string, T: Tuning, skill: HandSkill, inc: Map<string, number>): number {
  const o = ownerOf(s, c), t = findFighter(s, tid)!;
  const read = skill === "skilled";
  const v = o.ab.v;
  const blockValue = (m: HFighter, amount: number) => {
    const need = Math.max(0, (inc.get(m.id) ?? 0) - m.block);
    let val = Math.min(amount, need);
    if (read && need >= m.hp && need - amount < m.hp) val += 25;
    return val + (read ? 0 : amount * 0.15);
  };
  if (c.kind === "guard") return blockValue(t, guardAmount(o));
  if (c.ab === "shield") return blockValue(o, shieldAmount(o));
  if (c.ab === "heal") return Math.min(healAmount(v), t.maxHp - t.hp) * 0.9;
  if (c.ab === "thorns") {
    const hitsOn = read ? alive(s.theirs).filter(e => e.intent?.kind === "attack" && e.intent.target === o.id).reduce((a, e) => a + (e.intent as { hits: number }).hits, 0) : 0.8;
    return blockValue(o, guardAmount(o)) + thornsAmount(Math.max(v, 1)) * hitsOn * 0.8;
  }
  const { dmg, hits } = cardDamage(s, c, tid, T);
  const per = t.ab.type === "shield" ? Math.max(1, dmg - t.ab.v) : dmg;
  let total = 0, block = t.block;
  for (let h = 0; h < hits; h++) { const b = Math.min(block, per); block -= b; total += per - b; }
  if (c.ab === "clumsy") total *= 1 - CLUMSY_SELF;
  const lost = Math.min(t.hp, total);
  let val = lost + (1 - t.hp / t.maxHp) * 4;
  if (lost >= t.hp) val += 15 + (read ? threat(t, s, T) : 0);
  if (read) val -= (t.hp - lost) / t.maxHp * 4;
  if (c.ab === "burn") val += burnPerTurn(v) * Math.min(BURN_TURNS, 2);
  if (c.ab === "drain") val += Math.min(lost, o.maxHp - o.hp) * 0.6;
  if (t.ab.type === "thorns") val -= t.ab.v * hits;
  return val;
}

/** Plays one turn's cards for a simulated player, then ends the turn. */
export function botTurn(s: HandState, T: Tuning, skill: HandSkill, rng: Rng) {
  while (s.phase === "player") {
    const options: { c: ActionCard; t: string; v: number }[] = [];
    const inc = incoming(s, T, skill === "skilled");
    for (const c of s.hand) {
      if (cannotPlay(s, c)) continue;
      for (const t of validTargets(s, c)) options.push({ c, t, v: skill === "none" ? rng() : evaluate(s, c, t, T, skill, inc) / Math.max(c.cost, 0.6) + (skill === "casual" ? rng() * 4 : rng() * 0.5) });
    }
    if (!options.length) break;
    const best = options.sort((a, b) => b.v - a.v)[0];
    playCard(s, best.c, best.t, T, rng);
  }
  if (s.phase === "player") endTurn(s, T, rng);
}

export function simulateHand(party: Card[], opp: Opponent, T: Tuning, skill: HandSkill, rng: Rng): HandState {
  const s = createHand(party, opp, T, rng);
  while (s.phase !== "over") botTurn(s, T, skill, rng);
  return s;
}
