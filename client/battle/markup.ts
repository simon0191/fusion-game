import type { BattleState, Fighter } from "../../shared/battle/engine.js";
import { fighter, koCount } from "../../shared/battle/engine.js";
import { S } from "../state/store.js";
import { chipHTML, hpClass, monsterArt } from "./cards.js";
import { esc } from "../util.js";
import { muteButtonHTML } from "../audio/engine.js";

export function scoreHTML(b: BattleState) {
  return `<span>Turn <b>${b.turn}</b>/${S.tuning.turnLimit}</span><span>Your KOs <b>${koCount(b.theirs)}</b>/${S.tuning.kosToWin}</span><span>Their KOs <b>${koCount(b.mine)}</b>/${S.tuning.kosToWin}</span>`;
}
export const plateInner = (f: Fighter) =>
  `<div class="pn">${esc(f.name)}<span>${f.hp}/${f.maxHp}</span></div><div class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></div>`;

export function teamHTML(b: BattleState, side: "mine" | "theirs", pickable: boolean) {
  const pick = side === "mine" ? b.myPick : b.theirPick;
  return b[side].map(f => chipHTML(f, side, { pickable: pickable && side === "mine" && f.hp > 0, active: pick === f.id })).join("");
}

function bar(b: BattleState) {
  return `<div class="bbar">
    <div class="row1"><div class="score" id="score">${scoreHTML(b)}</div><button type="button" class="winnow" data-winnow>Win now</button></div>
    <div class="row2">
      <div class="seg" role="group" aria-label="Animation speed">Speed ${[1, 2, 3].map(s => `<button type="button" data-speed="${s}" aria-pressed="${S.speed === s}">${s}×</button>`).join("")}</div>
      <div class="seg">${muteButtonHTML("")}</div>
    </div>
  </div>`;
}

function arena(b: BattleState) {
  const mp = fighter(b, "mine"), tp = fighter(b, "theirs");
  return `<div class="arena" id="arena">
    ${tp ? `<div class="plate theirs">${plateInner(tp)}</div>` : ""}
    ${mp ? `<div class="plate mine">${plateInner(mp)}</div>` : ""}
    <div class="slot theirs">${tp ? `<div class="mon" id="monTheirs">${monsterArt(tp)}</div>` : ""}</div>
    <div class="slot mine">${mp ? `<div class="mon" id="monMine">${monsterArt(mp)}</div>` : ""}</div>
    <canvas id="fx"></canvas>
  </div>`;
}

const prompt = `<div class="prompt" id="prompt"></div>`;
const blog = (logHTML: string) => `<ol class="blog" id="blog">${logHTML}</ol>`;

/** Battle screen: enemy team on top, arena, then your three monsters fanned like a hand of cards. Fits one phone screen. */
export function battleHTML(b: BattleState, pickable: boolean, logHTML: string) {
  return `<div class="battle">${bar(b)}
    <div class="team theirs">${teamHTML(b, "theirs", false)}</div>
    ${arena(b)}${prompt}
    <div class="team mine">${teamHTML(b, "mine", pickable)}</div>
    ${blog(logHTML)}
  </div>`;
}
