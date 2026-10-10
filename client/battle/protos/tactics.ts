import "../../styles/proto-tactics.css";
import type { Opponent, Side } from "../../../shared/types.js";
import {
  TACTICS, SPECIALS, type Action, type ActionKind, type TEvent, type TFighter, type TacticsState,
  active, beginTurn, bestReplacement, canUse, createTactics, endTurn, enemyChoose, koCount, needsReplacement,
  other, resolveAction, sendIn, turnOrder,
} from "../../../shared/battle/protos/tactics.js";
import { ELEMENTS } from "../../../shared/data/elements.js";
import { S, partyCards, save, type BattleMode } from "../../state/store.js";
import { openScreen } from "../../router.js";
import { $, esc } from "../../util.js";
import { hpClass, monsterArt } from "../cards.js";
import { plateInner } from "../markup.js";
import { animAttack, enterFx, floatText, hitFx, koFx, setSpeed, setupFx, speed } from "../fx.js";
import { timingTap } from "../timing.js";
import { type BattleMechanic, finishBattle, modeBarHTML, switchMode } from "../modes.js";

type Mode = "idle" | "act" | "swap" | "replace";

interface Run {
  b: TacticsState;
  dead: boolean;
  mode: Mode;
  choose: ((a: Action | null) => void) | null;
  /** Called by `stop` to clear timers and settle pending waits. */
  cleanups: Set<() => void>;
  onClick: (e: MouseEvent) => void;
}

let run: Run | null = null;

const SHORT: Record<string, string> = {
  burn: "Hit and burn 3 turns", heal: "Hit, heal 40%", double: "Hit three times", shield: "Block all, counter",
  quick: "First, hit twice", drain: "Big hit, heal 75%", thorns: "Hit, reflect next hit", crit: "Sure double damage",
  clumsy: "Huge hit, may trip",
};
const ACT_WORDS: Record<ActionKind, string> = { strike: "Strike", special: "Special", guard: "Guard", swap: "Swap" };
const HOW_TO = "Both sides pick in secret. <b>Guard</b> softens Strikes and counters them, but Specials break it. The hint on the enemy is right most of the time.";

function start(opp: Opponent) {
  stop();
  const b = createTactics(partyCards(), opp);
  const r: Run = { b, dead: false, mode: "idle", choose: null, cleanups: new Set(), onClick: e => onClick(r, e) };
  run = r;
  setSpeed(S.speed);
  const o = openScreen(screenHTML(b));
  o.classList.add("battle-mode");
  o.onclick = r.onClick;
  setupFx();
  const onKey = (e: KeyboardEvent) => onKeyDown(r, e);
  const onResize = () => setupFx();
  addEventListener("keydown", onKey);
  addEventListener("resize", onResize);
  r.cleanups.add(() => { removeEventListener("keydown", onKey); removeEventListener("resize", onResize); });
  log(`${esc(opp.name)}: "${esc(opp.line)}"`);
  void loop(r);
}

function stop() {
  const r = run;
  if (!r) return;
  run = null;
  r.dead = true;
  for (const c of [...r.cleanups]) c();
  r.cleanups.clear();
  if (r.choose) { const c = r.choose; r.choose = null; c(null); }
  const o = $("#overlay");
  if (o && o.onclick === r.onClick) o.onclick = null;
}

export const tactics: BattleMechanic = { start, stop };

/** A sleep that `stop` cuts short. Follows the battle speed. */
function wait(r: Run, ms: number) {
  return new Promise<void>(res => {
    const done = () => { clearTimeout(id); r.cleanups.delete(done); res(); };
    const id = setTimeout(done, ms / speed);
    r.cleanups.add(done);
  });
}

function choose(r: Run, mode: Mode) {
  r.mode = mode;
  drawControls(r);
  return new Promise<Action | null>(res => { r.choose = res; });
}

function pick(r: Run, a: Action) {
  const c = r.choose;
  if (!c) return;
  r.choose = null;
  r.mode = "idle";
  drawControls(r);
  c(a);
}

/* ---------- Battle loop ---------- */

async function loop(r: Run) {
  const b = r.b, T = S.tuning;
  await Promise.all([enterFx("theirs"), enterFx("mine")]);
  while (!b.over) {
    if (r.dead) return;
    if (needsReplacement(b, "theirs")) {
      sendIn(b, "theirs", bestReplacement(b, "theirs", Math.random, 4));
      drawSlot(b, "theirs");
      log(`${esc(b.opp.name)} sends in <b>${esc(active(b, "theirs").name)}</b>.`);
      await enterFx("theirs");
    }
    if (needsReplacement(b, "mine")) {
      say("Your monster is down. Tap a bench monster to send it in.");
      const a = await choose(r, "replace");
      if (r.dead || !a || a.kind !== "swap") return;
      sendIn(b, "mine", a.to);
      drawSlot(b, "mine");
      log(`You send in <b>${esc(active(b, "mine").name)}</b>.`);
      await enterFx("mine");
    }
    if (r.dead) return;

    const intent = enemyChoose(b, Math.random);
    const foe = active(b, "theirs");
    drawIntent(`${esc(foe.name)} ${intent.text}`);
    say(b.turn === 1 ? HOW_TO : `<b>${esc(foe.name)}</b> ${intent.text}. Pick your move.`);
    const act = await choose(r, "act");
    if (r.dead || !act) return;
    drawIntent("");
    log(`Turn ${b.turn}: you chose <b>${actionWords(b, "mine", act)}</b>, ${esc(foe.name)} chose <b>${actionWords(b, "theirs", intent.action)}</b>${intent.hint !== intent.action.kind ? " (the hint was a bluff)" : ""}.`);
    await playEvents(r, beginTurn(b, act, intent.action));

    for (const side of turnOrder(b, Math.random)) {
      if (r.dead) return;
      const a = active(b, side), d = active(b, other(side));
      if (a.hp <= 0 || d.hp <= 0) continue;
      const special = b.acts[side]?.kind === "special";
      const what = special ? SPECIALS[a.ab.type].name : "Strike";
      say(side === "mine" ? `<b>${esc(a.name)}</b> uses ${what}! Tap when the rings meet.` : `<b>${esc(a.name)}</b> uses ${what} on you! Tap to ${b.shield.mine || (b.guard.mine && !special) ? "power your counter" : "block"}.`);
      const grade = await timingTap($("#arena")!, side === "mine" ? "attack" : "defend", () => r.dead);
      if (r.dead) return;
      S.stats[grade]++;
      await playEvents(r, resolveAction(b, side, grade, T, Math.random));
    }
    if (r.dead) return;
    await playEvents(r, endTurn(b, T));
    drawAll(r);
    await wait(r, 350);
  }
  if (r.dead) return;
  say(b.result === "win" ? `You win! (${b.endReason})` : `${esc(b.opp.name)} wins. (${b.endReason})`);
  await wait(r, 900);
  if (r.dead) return;
  finishBattle(b.opp, b.result === "win", b.turn, b.theirs);
}

function actionWords(b: TacticsState, side: Side, a: Action) {
  if (a.kind === "special") return esc(SPECIALS[active(b, side).ab.type].name);
  if (a.kind === "swap") return `Swap to ${esc(b[side].find(f => f.id === a.to)!.name)}`;
  return ACT_WORDS[a.kind];
}

async function playEvents(r: Run, events: TEvent[]) {
  const b = r.b;
  const nm = (side: Side, id?: string) => esc((id ? b[side].find(f => f.id === id) : active(b, side))!.name);
  for (const e of events) {
    if (r.dead) return;
    switch (e.kind) {
      case "swap":
        drawSlot(b, e.side);
        log(`${e.side === "mine" ? "You swap" : `${esc(b.opp.name)} swaps`} <b>${nm(e.side, e.from)}</b> out for <b>${nm(e.side, e.to)}</b>.`);
        await enterFx(e.side);
        break;
      case "guard":
        floatText(e.side, "Guard", "tt-note");
        break;
      case "shieldUp":
        floatText(e.side, "Bulwark!", "tt-note");
        log(`<b>${nm(e.side)}</b> raises Bulwark and will block every hit.`);
        break;
      case "reflectUp":
        floatText(e.side, "Spikes!", "tt-note");
        break;
      case "special":
        floatText(e.side, SPECIALS[active(b, e.side).ab.type].name + "!", "big");
        await wait(r, 250);
        break;
      case "hit": {
        const a = active(b, e.from);
        await animAttack(e.from, e.to, ELEMENTS[a.els[0]].color, e.selfHit);
        if (r.dead) return;
        floatText(e.to, e.dmg ? `-${e.dmg}` : "Blocked", e.crit || e.effect === "super" ? "big" : "");
        await hitFx(e.to);
        let msg = e.selfHit ? `<b>${nm(e.from)}</b> trips and hits itself for ${e.dmg}!`
          : `<b>${nm(e.from)}</b> ${e.counter ? "counters" : "hits"} ${nm(e.to)} for ${e.dmg}.`;
        if (e.blocked === "shield") msg = `<b>${nm(e.to)}</b> blocks ${nm(e.from)}'s hit completely.`;
        else if (e.blocked === "guard") msg += " Guarded.";
        if (e.crit) msg += " Double damage!";
        if (e.effect === "super" && e.dmg) msg += " Super effective!";
        if (e.effect === "weak" && e.dmg) msg += " Not very effective.";
        if (!e.selfHit && e.timing === "perfect") msg += e.from === "mine" ? " Perfect timing!" : " Perfect block!";
        log(msg);
        break;
      }
      case "reflect":
        floatText(e.side, `-${e.dmg}`, "big");
        await hitFx(e.side);
        log(`Spikes bounce the hit back. <b>${nm(e.side)}</b> takes ${e.dmg}.`);
        break;
      case "thorns":
        if (e.dmg) { floatText(e.side, `-${e.dmg}`, ""); log(`Thorns hurt ${nm(e.side)} for ${e.dmg}.`); }
        break;
      case "heal":
        floatText(e.side, `+${e.amount}`, "heal");
        if (e.amount >= 8) log(`<b>${nm(e.side)}</b> heals ${e.amount} HP.`);
        break;
      case "burnSet":
        log(`<b>${nm(e.side, e.id)}</b> is burning for ${TACTICS.burnTurns} turns.`);
        break;
      case "burn":
        if (e.id === b.active[e.side]) floatText(e.side, `-${e.dmg}`, "tt-burn");
        log(`${nm(e.side, e.id)} burns for ${e.dmg}.`);
        break;
      case "ko":
        drawAll(r);
        if (e.id === b.active[e.side]) await koFx(e.side);
        log(`<b>${nm(e.side, e.id)}</b> is knocked out!`);
        break;
    }
    if (r.dead) return;
    drawAll(r);
    await wait(r, 140);
  }
}

/* ---------- Input ---------- */

function onClick(r: Run, e: MouseEvent) {
  const t = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!t || r.dead) return;
  const d = t.dataset, b = r.b;
  if (d.act) chooseAct(r, d.act as ActionKind);
  else if (d.pick && (r.mode === "swap" || r.mode === "replace")) pick(r, { kind: "swap", to: d.pick });
  else if (d.speed) {
    S.speed = Number(d.speed); setSpeed(S.speed); save();
    document.querySelectorAll<HTMLElement>(".p-tactics [data-speed]").forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.speed) === S.speed)));
  } else if (d.mode) switchMode(d.mode as BattleMode, b.opp);
  else if (d.winnow !== undefined && !b.over) finishBattle(b.opp, true, b.turn, b.theirs, true);
}

function chooseAct(r: Run, kind: ActionKind) {
  if (r.mode === "swap" && kind === "swap") {
    r.mode = "act";
    drawControls(r);
    say("Pick your move.");
    return;
  }
  if (r.mode !== "act" || !canUse(r.b, "mine", kind)) return;
  if (kind === "swap") {
    r.mode = "swap";
    drawControls(r);
    say("Tap a bench monster to swap in. It takes this turn's hit.");
    return;
  }
  pick(r, { kind } as Action);
}

function onKeyDown(r: Run, e: KeyboardEvent) {
  if (e.repeat || r.dead) return;
  const kinds: ActionKind[] = ["strike", "special", "guard", "swap"];
  const n = Number(e.key);
  if (n >= 1 && n <= 4) chooseAct(r, kinds[n - 1]);
  else if (e.key === "Escape" && r.mode === "swap") chooseAct(r, "swap");
}

/* ---------- Rendering ---------- */

function screenHTML(b: TacticsState) {
  return `<div class="battle p-tactics">
    <div class="bbar">
      <div class="row1"><div class="score" id="score">${scoreHTML(b)}</div><button type="button" class="winnow" data-winnow>Win now</button></div>
      <div class="row2"><div class="seg" role="group" aria-label="Animation speed">Speed ${[1, 2, 3].map(s => `<button type="button" data-speed="${s}" aria-pressed="${S.speed === s}">${s}×</button>`).join("")}</div></div>
      <div class="row2">${modeBarHTML()}</div>
    </div>
    <div class="tt-team theirs" id="ttTheirs" aria-label="${esc(b.opp.name)}'s team">${teamHTML(b, "theirs", false)}</div>
    <div class="arena" id="arena">
      <div class="plate theirs" id="plateTheirs">${plateHTML(b, "theirs")}</div>
      <div class="plate mine" id="plateMine">${plateHTML(b, "mine")}</div>
      <div class="slot theirs">${monHTML(b, "theirs")}</div>
      <div class="slot mine">${monHTML(b, "mine")}</div>
      <div class="tt-intent" id="ttIntent" hidden></div>
      <canvas id="fx"></canvas>
    </div>
    <div class="tt-team mine" id="ttMine" aria-label="Your team">${teamHTML(b, "mine", false)}</div>
    <div class="prompt" id="prompt" aria-live="polite"></div>
    <div class="tt-acts" id="ttActs">${actsHTML(b, "idle")}</div>
    <ol class="blog" id="blog"></ol>
  </div>`;
}

const scoreHTML = (b: TacticsState) =>
  `<span>Turn <b>${b.turn}</b>/${TACTICS.turnLimit}</span><span>Your KOs <b>${koCount(b.theirs)}</b>/${S.tuning.kosToWin}</span><span>Their KOs <b>${koCount(b.mine)}</b>/${S.tuning.kosToWin}</span>`;

function pipsHTML(f: TFighter) {
  let s = "";
  for (let i = 1; i <= TACTICS.energyMax; i++) s += `<i class="${i <= f.energy ? "on" : ""}${i === TACTICS.specialCost ? " cost" : ""}"></i>`;
  return `<span class="tt-pips" role="img" aria-label="Energy ${f.energy} of ${TACTICS.energyMax}">${s}</span>`;
}

function plateHTML(b: TacticsState, side: Side) {
  const f = active(b, side);
  const tags = [
    b.guard[side] ? `<span class="tt-tag">Guard</span>` : "",
    b.shield[side] ? `<span class="tt-tag">Bulwark</span>` : "",
    f.reflect ? `<span class="tt-tag">Spikes</span>` : "",
    f.burnTurns > 0 ? `<span class="tt-tag burn">Burn ${f.burnTurns}</span>` : "",
  ].join("");
  return `${plateInner(f)}<div class="tt-prow">${pipsHTML(f)}${tags}</div>`;
}

const monHTML = (b: TacticsState, side: Side) => {
  const f = active(b, side);
  return f.hp > 0 ? `<div class="mon" id="${side === "mine" ? "monMine" : "monTheirs"}">${monsterArt(f)}</div>` : "";
};

function teamHTML(b: TacticsState, side: Side, pickable: boolean) {
  return b[side].map(f => {
    const can = pickable && f.hp > 0 && f.id !== b.active[side];
    const tag = can ? "button" : "div";
    const cls = `mchip tt-chip${f.hp <= 0 ? " ko" : ""}${f.id === b.active[side] ? " active" : ""}${can ? " pickable" : ""}`;
    const attrs = can ? `type="button" data-pick="${f.id}" aria-label="Send in ${esc(f.name)}"` : "";
    return `<${tag} class="${cls}" style="--el:${ELEMENTS[f.els[0]].color}" ${attrs}>
      ${monsterArt(f)}
      <span class="mn">${esc(f.name)}</span>
      <span class="tt-hp"><span class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></span><span class="tt-num">${f.hp}</span></span>
      ${pipsHTML(f)}
    </${tag}>`;
  }).join("");
}

function actsHTML(b: TacticsState, mode: Mode) {
  const f = active(b, "mine");
  const on = (k: ActionKind) => mode === "act" && canUse(b, "mine", k);
  const btn = (k: ActionKind, key: number, title: string, sub: string, extra = "") =>
    `<button type="button" class="tt-act ${k}${extra}" data-act="${k}" ${on(k) || (mode === "swap" && k === "swap") ? "" : "disabled"} aria-keyshortcuts="${key}"><b>${title}</b><span>${sub}</span></button>`;
  const sp = SPECIALS[f.ab.type];
  return btn("strike", 1, "Strike", "Hit · +1 energy")
    + btn("special", 2, esc(sp.name), `${TACTICS.specialCost} energy · ${SHORT[f.ab.type]}`, on("special") ? " ready" : "")
    + btn("guard", 3, "Guard", "Soften & counter · +2")
    + (mode === "swap" ? btn("swap", 4, "Cancel", "Keep fighting", " cancel") : btn("swap", 4, "Swap", "Bench takes the hit"));
}

function drawControls(r: Run) {
  const acts = $("#ttActs");
  if (acts) acts.innerHTML = actsHTML(r.b, r.mode);
  const mine = $("#ttMine");
  if (mine) mine.innerHTML = teamHTML(r.b, "mine", r.mode === "swap" || r.mode === "replace");
}

function drawAll(r: Run) {
  const b = r.b;
  const score = $("#score");
  if (score) score.innerHTML = scoreHTML(b);
  const pt = $("#plateTheirs"), pm = $("#plateMine"), tt = $("#ttTheirs");
  if (pt) pt.innerHTML = plateHTML(b, "theirs");
  if (pm) pm.innerHTML = plateHTML(b, "mine");
  if (tt) tt.innerHTML = teamHTML(b, "theirs", false);
  drawControls(r);
}

function drawSlot(b: TacticsState, side: Side) {
  const slot = $(`.p-tactics .slot.${side}`);
  if (slot) slot.innerHTML = monHTML(b, side);
}

function drawIntent(html: string) {
  const el = $("#ttIntent");
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
}

const say = (html: string) => { const p = $("#prompt"); if (p) p.innerHTML = html; };
function log(html: string) {
  const l = $("#blog");
  if (!l) return;
  l.insertAdjacentHTML("afterbegin", `<li>${html}</li>`);
  while (l.children.length > 40) l.lastElementChild!.remove();
}
