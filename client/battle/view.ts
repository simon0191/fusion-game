import type { Opponent, Side } from "../../shared/types.js";
import { type BattleEvent, type BattleState, type Fighter, attackOrder, choosePick, createBattle, end, enemyPick, fighter, finishTurn, koCount, resolveAttack } from "../../shared/battle/engine.js";
import { ELEMENTS } from "../../shared/data/elements.js";
import { ABILITIES } from "../../shared/data/abilities.js";
import { S, partyCards, save } from "../state/store.js";
import { openScreen } from "../router.js";
import { $, esc } from "../util.js";
import { hpClass, miniHTML, miniStats, monsterSVG } from "./cards.js";
import { animAttack, enterFx, floatText, hitFx, koFx, setSpeed, setupFx, sleep } from "./fx.js";
import { timingTap } from "./timing.js";
import { showLost, showReward } from "../screens/after.js";

let b: BattleState | null = null;
let pickResolve: ((id: string) => void) | null = null;

export function startBattle(opp: Opponent) {
  b = createBattle(partyCards(), opp);
  setSpeed(S.speed);
  render();
  log(`${esc(opp.name)}: "${esc(opp.line)}"`);
  void loop(b);
}

async function loop(battle: BattleState) {
  const T = S.tuning;
  while (!battle.over) {
    const t = enemyPick(battle, Math.random);
    render();
    await enterFx("theirs");
    say(`${esc(battle.opp.name)} sends <b>${esc(t.name)}</b> (${t.els.join("/")}, ${ABILITIES[t.ab.type].name}). Tap one of your monsters to fight it.`);
    const id = await new Promise<string>(r => { pickResolve = r; markPickable(true); });
    if (battle.over) break;
    choosePick(battle, id);
    render();
    await enterFx("mine");
    say(`Turn ${battle.turn}: <b>${esc(fighter(battle, "mine")!.name)}</b> vs <b>${esc(t.name)}</b>`);

    for (const side of attackOrder(battle, Math.random)) {
      if (battle.over) return;
      const a = fighter(battle, side)!, d = fighter(battle, side === "mine" ? "theirs" : "mine")!;
      if (a.hp <= 0 || d.hp <= 0) continue;
      say(side === "mine" ? `<b>${esc(a.name)}</b> attacks!` : `<b>${esc(a.name)}</b> attacks you!`);
      const grade = await timingTap($("#arena")!, side === "mine" ? "attack" : "defend", () => battle.over);
      if (battle.over) return;
      S.stats[grade]++;
      await play(resolveAttack(battle, side, grade, T, Math.random), battle);
    }
    if (battle.over) return;
    await sleep(400);
    finishTurn(battle, T);
  }
  if (b === battle) finish(battle);
}

async function play(events: BattleEvent[], battle: BattleState) {
  for (const e of events) {
    if (battle.over) return;
    if (e.kind === "hit") {
      const a = fighter(battle, e.from)!, target = fighter(battle, e.to)!;
      await animAttack(e.from, e.to, ELEMENTS[a.els[0]].color, e.selfHit);
      floatText(e.to, e.dmg ? `-${e.dmg}` : "Blocked", e.crit || e.effect === "super" ? "big" : "");
      await hitFx(e.to);
      let msg = e.selfHit ? `<b>${esc(a.name)}</b> trips and hits itself for ${e.dmg}!` : `<b>${esc(a.name)}</b> hits ${esc(target.name)} for ${e.dmg}.`;
      if (e.crit) msg += " Lucky hit, double damage!";
      if (e.effect === "super") msg += " Super effective!";
      if (e.effect === "weak") msg += " Not very effective.";
      if (!e.selfHit && e.timing === "perfect") msg += e.from === "mine" ? " Perfect timing!" : " Perfect block!";
      log(msg);
    } else if (e.kind === "heal") {
      floatText(e.side, `+${e.amount}`, "heal");
    } else if (e.kind === "thorns") {
      floatText(e.side, `-${e.dmg}`, "");
      log(`Thorns hurt ${esc(fighter(battle, e.side)!.name)} for ${e.dmg}.`);
    } else if (e.kind === "ko") {
      refresh();
      await koFx(e.side);
      log(`<b>${esc(battle[e.side].find(f => f.id === e.id)!.name)}</b> is knocked out!`);
    }
    refresh();
    await sleep(150);
  }
}

function finish(battle: BattleState) {
  const skipped = battle.endReason === "skipped";
  if (!S.tuning.alwaysWin && !skipped) {
    S.stats.battles++;
    if (battle.result === "win") S.stats.wins++;
    S.stats.turns.push(battle.turn);
  }
  if (battle.result === "win" && !S.beaten.includes(battle.opp.id)) S.beaten.push(battle.opp.id);
  save();
  b = null;
  if (battle.result === "win") showReward(battle.opp, battle.turn);
  else showLost(battle.opp, battle.turn);
}

/* ---------- Rendering ---------- */
function scoreHTML(battle: BattleState) {
  return `<span>Turn <b>${battle.turn}</b>/${S.tuning.turnLimit}</span><span>Your KOs <b>${koCount(battle.theirs)}</b>/${S.tuning.kosToWin}</span><span>Their KOs <b>${koCount(battle.mine)}</b>/${S.tuning.kosToWin}</span>`;
}
const plateInner = (f: Fighter) => `<div class="pn">${esc(f.name)}<span>${f.hp}/${f.maxHp}</span></div><div class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></div>`;

function render() {
  if (!b) return;
  const mp = fighter(b, "mine"), tp = fighter(b, "theirs");
  const logHTML = $("#blog")?.innerHTML ?? "";
  const o = openScreen(`<div class="battle">
    <div class="bhud">
      <div class="score" id="score">${scoreHTML(b)}</div>
      <div class="speed" role="group" aria-label="Animation speed">Speed ${[1, 2, 3].map(s => `<button type="button" data-speed="${s}" aria-pressed="${S.speed === s}">${s}×</button>`).join("")}
        <button type="button" class="win" data-winnow>Win now</button></div>
    </div>
    <div class="team"><h3>${esc(b.opp.name)}</h3>${b.theirs.map(f => miniHTML(f, "theirs", { active: tp?.id === f.id })).join("")}</div>
    <div class="arena" id="arena">
      ${tp ? `<div class="plate theirs">${plateInner(tp)}</div>` : ""}
      ${mp ? `<div class="plate mine">${plateInner(mp)}</div>` : ""}
      <div class="slot theirs">${tp ? `<div class="mon" id="monTheirs">${monsterSVG(tp.look)}</div>` : ""}</div>
      <div class="slot mine">${mp ? `<div class="mon" id="monMine">${monsterSVG(mp.look)}</div>` : ""}</div>
      <canvas id="fx"></canvas>
    </div>
    <div class="prompt" id="prompt"></div>
    <div class="team mine"><h3>Your party</h3>${b.mine.map(f => miniHTML(f, "mine", { active: mp?.id === f.id })).join("")}</div>
    <ol class="blog" id="blog">${logHTML}</ol>
  </div>`);
  o.onclick = onClick;
  setupFx();
}

function markPickable(on: boolean) {
  if (!b) return;
  const team = $(".team.mine");
  if (!team) return;
  team.innerHTML = `<h3>Your party</h3>${b.mine.map(f => miniHTML(f, "mine", { pickable: on && f.hp > 0, active: b!.myPick === f.id })).join("")}`;
}

function refresh() {
  if (!b) return;
  for (const side of ["mine", "theirs"] as Side[]) {
    const f = fighter(b, side);
    const plate = $(`.plate.${side}`);
    if (f && plate) plate.innerHTML = plateInner(f);
    for (const x of b[side]) {
      const el = $(`[data-mini="${side}-${x.id}"]`);
      if (!el) continue;
      el.classList.toggle("ko", x.hp <= 0);
      el.querySelector(".ms")!.textContent = miniStats(x);
      const bar = el.querySelector<HTMLElement>(".hpbar span")!;
      bar.className = hpClass(x);
      bar.style.width = (x.hp / x.maxHp) * 100 + "%";
    }
  }
  const score = $("#score");
  if (score) score.innerHTML = scoreHTML(b);
}

const say = (html: string) => { const p = $("#prompt"); if (p) p.innerHTML = html; };
const log = (html: string) => $("#blog")?.insertAdjacentHTML("afterbegin", `<li>${html}</li>`);

function onClick(e: MouseEvent) {
  const t = (e.target as HTMLElement).closest("button");
  if (!t || !b) return;
  const d = t.dataset;
  if (d.fight && pickResolve) {
    const r = pickResolve; pickResolve = null;
    markPickable(false);
    r(d.fight);
  } else if (d.speed) {
    S.speed = Number(d.speed); setSpeed(S.speed); save();
    document.querySelectorAll<HTMLElement>("[data-speed]").forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.speed) === S.speed)));
  } else if (d.winnow !== undefined && !b.over) {
    const battle = b;
    end(battle, true, "skipped");
    if (pickResolve) { const r = pickResolve; pickResolve = null; r(""); }
    finish(battle);
  }
}

addEventListener("resize", () => { if (b) setupFx(); });
