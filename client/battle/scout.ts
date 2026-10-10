import type { Fighter } from "../../shared/battle/engine.js";
import type { Element, Tuning } from "../../shared/types.js";
import { ELEMENTS, elementMultiplier } from "../../shared/data/elements.js";
import { esc } from "../util.js";

/** Enemy scouting: a full stats sheet when you tap an enemy card. */

const SYMBOL: Record<Element, string> = { fire: "🔥", water: "💧", leaf: "🍃", rock: "🪨", spark: "⚡", shadow: "🌙" };

/** Element symbols in coloured dots, for the small enemy cards. */
export const elIcons = (f: Fighter) => f.els.map(e => `<span class="elic" style="--c:${ELEMENTS[e].color}" title="${e}" aria-label="${e}">${SYMBOL[e]}</span>`).join("");

export const elChips = (f: Fighter) => `<span class="els">${f.els.map(e => `<span class="chip" style="--c:${ELEMENTS[e].color}">${e}</span>`).join("")}</span>`;

/** Expected damage of one attack turn, ignoring timing taps and random spread. */
function turnDamage(a: Fighter, d: Fighter, T: Tuning) {
  const hits = a.ab.type === "double" ? 2 : 1;
  let per = a.atk * T.dmgMult * (hits === 2 ? 0.6 : 1) * elementMultiplier(a.els, d.els);
  if (a.ab.type === "crit") per *= 1.3;
  if (a.ab.type === "burn") per += a.ab.v;
  if (d.ab.type === "shield") per -= d.ab.v;
  let dmg = Math.max(1, per) * hits;
  if (a.ab.type === "clumsy") dmg *= 0.7;
  return dmg;
}

type Verdict = "good" | "even" | "risky";

/** Rough call on a one-on-one fight: whoever needs fewer turns to knock the other out wins, speed breaks ties. */
function matchup(me: Fighter, them: Fighter, T: Tuning) {
  const m = elementMultiplier(me.els, them.els), back = elementMultiplier(them.els, me.els);
  const edge = m > back ? "strong" : m < back ? "weak" : "even";
  const mq = me.ab.type === "quick", tq = them.ab.type === "quick";
  const first = mq !== tq ? (mq ? "you" : "them") : me.spd !== them.spd ? (me.spd > them.spd ? "you" : "them") : "coin";
  let take = turnDamage(them, me, T);
  if (them.ab.type === "thorns") take += them.ab.v * (me.ab.type === "double" ? 2 : 1);
  const myTurns = Math.ceil(them.hp / turnDamage(me, them, T)), theirTurns = Math.ceil(me.hp / take);
  const verdict: Verdict = myTurns < theirTurns ? "good" : myTurns > theirTurns ? "risky" : first === "you" ? "good" : first === "them" ? "risky" : "even";
  return { edge, verdict };
}

const VERDICT: Record<Verdict, string> = { good: "Good pick", even: "Even fight", risky: "Risky" };

/** Bottom sheet with the enemy's full card and how each of your monsters compares to it. */
export function inspectHTML(them: Fighter, mine: Fighter[], T: Tuning, cardHTML: string) {
  const cmp = (a: number, b: number) => (a > b ? "up" : a < b ? "down" : "");
  const rows = mine.map(me => {
    if (me.hp <= 0) return `<tr class="ko"><th>${esc(me.name)}</th><td colspan="5">Knocked out</td></tr>`;
    const x = matchup(me, them, T);
    return `<tr><th>${esc(me.name)} ${elChips(me)}</th>
      <td class="${cmp(me.hp, them.hp)}">${me.hp}</td><td class="${cmp(me.atk, them.atk)}">${me.atk}</td><td class="${cmp(me.spd, them.spd)}">${me.spd}</td>
      <td class="${x.edge === "strong" ? "up" : x.edge === "weak" ? "down" : ""}">${x.edge === "strong" ? "▲" : x.edge === "weak" ? "▼" : "="}</td>
      <td><span class="mu-tag ${x.verdict}">${VERDICT[x.verdict]}</span></td></tr>`;
  }).join("");
  return `<div class="sheet-bg" data-close-inspect></div>
  <div class="sheet" role="dialog" aria-label="${esc(them.name)} stats">
    <button type="button" class="sheet-x" data-close-inspect aria-label="Close">×</button>
    <div class="sheet-card">${cardHTML}<div class="sheet-hp">HP now <b>${them.hp}/${them.maxHp}</b></div></div>
    <table class="cmp"><thead><tr><th></th><th>HP</th><th>ATK</th><th>SPD</th><th>Type</th><th></th></tr></thead>
      <tbody><tr class="them"><th>${esc(them.name)} <span class="enemy-tag">Enemy</span></th><td>${them.hp}</td><td>${them.atk}</td><td>${them.spd}</td><td></td><td></td></tr>
      <tr class="sub"><th colspan="6">Your team</th></tr>${rows}</tbody></table>
  </div>`;
}
