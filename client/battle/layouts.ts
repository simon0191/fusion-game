import type { BattleState, Fighter } from "../../shared/battle/engine.js";
import { fighter, koCount } from "../../shared/battle/engine.js";
import { S, type BattleLayout } from "../state/store.js";
import { chipHTML, hpClass, monsterSVG } from "./cards.js";
import { esc } from "../util.js";

export const LAYOUT_NAMES: Record<BattleLayout, string> = { a: "Handheld", b: "Hand of cards", c: "Side rails" };

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
      <div class="seg" role="group" aria-label="Battle layout">Layout ${(["a", "b", "c"] as const).map(l => `<button type="button" data-layout="${l}" aria-pressed="${S.battleLayout === l}" title="${LAYOUT_NAMES[l]}">${l.toUpperCase()}</button>`).join("")}</div>
    </div>
  </div>`;
}

function arena(b: BattleState, extra = "") {
  const mp = fighter(b, "mine"), tp = fighter(b, "theirs");
  return `<div class="arena" id="arena">
    ${tp ? `<div class="plate theirs">${plateInner(tp)}</div>` : ""}
    ${mp ? `<div class="plate mine">${plateInner(mp)}</div>` : ""}
    <div class="slot theirs">${tp ? `<div class="mon" id="monTheirs">${monsterSVG(tp.look)}</div>` : ""}</div>
    <div class="slot mine">${mp ? `<div class="mon" id="monMine">${monsterSVG(mp.look)}</div>` : ""}</div>
    ${extra}
    <canvas id="fx"></canvas>
  </div>`;
}

const prompt = `<div class="prompt" id="prompt"></div>`;
const blog = (logHTML: string) => `<ol class="blog" id="blog">${logHTML}</ol>`;

/** Full battle screen for the chosen layout. All three fit one phone screen without scrolling. */
export function battleHTML(b: BattleState, layout: BattleLayout, pickable: boolean, logHTML: string) {
  if (layout === "b") {
    return `<div class="battle lay-b">${bar(b)}
      <div class="team theirs">${teamHTML(b, "theirs", false)}</div>
      ${arena(b)}${prompt}
      <div class="team mine">${teamHTML(b, "mine", pickable)}</div>
      ${blog(logHTML)}
    </div>`;
  }
  if (layout === "c") {
    return `<div class="battle lay-c">${bar(b)}
      <div class="stage">
        <div class="team mine">${teamHTML(b, "mine", pickable)}</div>
        ${arena(b)}
        <div class="team theirs">${teamHTML(b, "theirs", false)}</div>
      </div>
      ${prompt}${blog(logHTML)}
    </div>`;
  }
  return `<div class="battle lay-a">${bar(b)}
    ${arena(b, `<div class="team theirs pips" aria-label="${esc(b.opp.name)}'s team">${teamHTML(b, "theirs", false)}</div>`)}
    ${prompt}${blog(logHTML)}
    <div class="team mine">${teamHTML(b, "mine", pickable)}</div>
  </div>`;
}
