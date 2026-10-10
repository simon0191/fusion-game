import "../../styles/proto-hand.css";
import type { Element, Opponent } from "../../../shared/types.js";
import {
  type ActionCard, type HFighter, type HandEvent, type HandState, ENERGY, TURN_LIMIT,
  beginEnemyPhase, cannotPlay, cardDamage, cardName, cardShort, cardTarget, cardText, createHand, enemyAct, finishEnemyPhase,
  incomingDamage, intentText, koCount, ownerOf, playCard, validTargets,
} from "../../../shared/battle/protos/hand.js";
import { ELEMENTS } from "../../../shared/data/elements.js";
import { ABILITIES } from "../../../shared/data/abilities.js";
import { S, partyCards, save, type BattleMode } from "../../state/store.js";
import { openScreen } from "../../router.js";
import { $, esc } from "../../util.js";
import { hpClass, monsterSVG } from "../cards.js";
import { setSpeed } from "../fx.js";
import { type BattleMechanic, finishBattle, modeBarHTML, switchMode } from "../modes.js";

/** One running battle. `stop` flips `alive`, which every await checks before touching the screen. */
interface Run { s: HandState; alive: boolean; busy: boolean; selected: ActionCard | null; timers: Set<number>; wakers: Set<() => void> }
let run: Run | null = null;

const T = () => S.tuning;
const elColor = (f: { els: Element[] }) => ELEMENTS[f.els[0]].color;

function start(opp: Opponent) {
  stop();
  setSpeed(S.speed);
  const r: Run = { s: createHand(partyCards(), opp, T(), Math.random), alive: true, busy: false, selected: null, timers: new Set(), wakers: new Set() };
  run = r;
  const o = openScreen(shellHTML(r));
  o.classList.add("battle-mode");
  o.onclick = onClick;
  o.onmouseover = onHover;
  addEventListener("keydown", onKey);
  render(r);
  log(r, `${esc(opp.name)}: "${esc(opp.line)}"`);
}

function stop() {
  const r = run;
  if (!r) return;
  run = null;
  r.alive = false;
  for (const t of r.timers) clearTimeout(t);
  r.timers.clear();
  for (const w of r.wakers) w();
  r.wakers.clear();
  removeEventListener("keydown", onKey);
  const o = $("#overlay");
  if (o && o.onclick === onClick) { o.onclick = null; o.onmouseover = null; }
}

export const hand: BattleMechanic = { start, stop };

/** Sleeps for `ms` scaled by the speed buttons. Resolves early when the run stops; callers check `r.alive`. */
function wait(r: Run, ms: number) {
  return new Promise<void>(res => {
    if (!r.alive) return res();
    const done = () => { clearTimeout(id); r.timers.delete(id); r.wakers.delete(done); res(); };
    const id = window.setTimeout(done, ms / S.speed);
    r.timers.add(id);
    r.wakers.add(done);
  });
}

/* ---------- Markup ---------- */

function shellHTML(r: Run) {
  return `<div class="battle p-hand">
    <div class="bbar">
      <div class="row1"><div class="score" id="phScore"></div><button type="button" class="winnow" data-winnow>Win now</button></div>
      <div class="row2">${modeBarHTML()}
        <div class="seg" role="group" aria-label="Animation speed">${[1, 2, 3].map(v => `<button type="button" data-speed="${v}" aria-pressed="${S.speed === v}">${v}×</button>`).join("")}</div>
      </div>
    </div>
    <div class="ph-opp">${esc(r.s.opp.name)}</div>
    <div class="ph-row theirs" id="phTheirs"></div>
    <div class="prompt" id="prompt" aria-live="polite"></div>
    <div class="ph-row mine" id="phMine"></div>
    <ol class="blog" id="blog"></ol>
    <div class="ph-hand" id="phHand"></div>
    <div class="ph-foot" id="phFoot"></div>
    <div class="ph-fx" id="phFx" aria-hidden="true"></div>
  </div>`;
}

function fighterHTML(r: Run, f: HFighter, mine: boolean) {
  const s = r.s, sel = r.selected;
  const targetable = !!sel && !r.busy && (cardTarget(sel) === "self" ? sel.owner === f.id : validTargets(s, sel).includes(f.id));
  let hint = "";
  if (targetable && sel && !mine) {
    const { dmg, hits, mult } = cardDamage(s, sel, f.id, T());
    if (dmg) hint = `<span class="ph-hint ${mult > 1 ? "super" : mult < 1 ? "weak" : ""}">${hits > 1 ? `${hits}×` : ""}${dmg}${mult > 1 ? " Super" : mult < 1 ? " Weak" : ""}</span>`;
  }
  const tags: string[] = [];
  if (f.block) tags.push(`<span class="tag block" title="Block">⛨ ${f.block}</span>`);
  if (f.burnTurns) tags.push(`<span class="tag burn">Burn ${f.burn}×${f.burnTurns}</span>`);
  if (f.charged) tags.push(`<span class="tag charge">Charged ×2</span>`);
  if (f.thorns) tags.push(`<span class="tag spikes">Spikes ${f.thorns}</span>`);
  if (!mine && (f.ab.type === "shield" || f.ab.type === "thorns")) tags.push(`<span class="tag passive" title="${esc(ABILITIES[f.ab.type].describe(f.ab.v))}">${ABILITIES[f.ab.type].name} ${f.ab.v}</span>`);
  const inc = mine && f.hp > 0 && !r.busy ? incomingDamage(s, f.id, T()) : 0;
  if (inc) tags.push(`<span class="tag incoming" title="Damage coming this enemy phase">−${inc} coming</span>`);
  const intent = !mine ? `<div class="ph-intent ${f.intent?.kind ?? "none"}">${f.hp > 0 ? esc(intentText(s, f, T())) : "Knocked out"}</div>` : "";
  return `<div class="ph-f${f.hp <= 0 ? " ko" : ""}${targetable ? " target" : ""}" data-fid="${f.id}">
    ${intent}
    <button type="button" class="ph-body" style="--el:${elColor(f)}" data-target="${f.id}" ${targetable ? "" : `aria-disabled="true"`} aria-label="${esc(f.name)}, ${f.hp} of ${f.maxHp} HP">
      ${hint}
      <span class="ph-art">${monsterSVG(f.look)}</span>
      <span class="ph-name">${esc(f.name)}</span>
      <span class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></span>
      <span class="ph-hp">${f.hp}/${f.maxHp}</span>
    </button>
    <div class="ph-tags">${tags.join("")}</div>
  </div>`;
}

function cardHTML(r: Run, c: ActionCard, i: number, n: number) {
  const s = r.s, o = ownerOf(s, c);
  const why = cannotPlay(s, c);
  const mid = (n - 1) / 2, off = i - mid;
  const label = c.fainted ? `Fainted card of ${o.name}` : `${cardName(c)}, cost ${c.cost}, ${o.name}. ${cardText(s, c, null, T())}`;
  return `<button type="button" class="ph-card${c.fainted ? " fainted" : ""}${why ? " off" : ""}${r.selected === c ? " sel" : ""} k-${c.kind}" style="--el:${elColor(o)};--r:${off * 4}deg;--y:${Math.abs(off) * 5}px" data-card="${c.uid}" aria-label="${esc(label)}" aria-pressed="${r.selected === c}">
    <span class="cost">${c.fainted ? "–" : c.cost}</span>
    <span class="face">${monsterSVG(o.look)}</span>
    <span class="cn">${esc(cardName(c))}</span>
    <span class="cv">${esc(cardShort(s, c, null, T()))}</span>
    <span class="who">${esc(o.name)}</span>
  </button>`;
}

function render(r: Run) {
  if (!r.alive) return;
  const s = r.s;
  $("#phScore")!.innerHTML = `<span>Turn <b>${s.turn}</b>/${TURN_LIMIT}</span><span>Your KOs <b>${koCount(s.theirs)}</b>/${T().kosToWin}</span><span>Their KOs <b>${koCount(s.mine)}</b>/${T().kosToWin}</span>`;
  $("#phTheirs")!.innerHTML = s.theirs.map(f => fighterHTML(r, f, false)).join("");
  $("#phMine")!.innerHTML = s.mine.map(f => fighterHTML(r, f, true)).join("");
  $("#phHand")!.innerHTML = s.hand.length ? s.hand.map((c, i) => cardHTML(r, c, i, s.hand.length)).join("") : `<div class="ph-empty">${s.phase === "enemy" ? "Enemy turn" : "No cards left"}</div>`;
  const myTurn = s.phase === "player" && !r.busy;
  $("#phFoot")!.innerHTML = `<div class="energy" aria-label="Energy ${s.energy} of ${ENERGY}"><b>${s.energy}</b><span>/${ENERGY}</span></div>
    <div class="piles"><span>Draw <b>${s.draw.length}</b></span><span>Discard <b>${s.discard.length}</b></span></div>
    <button type="button" class="btn primary end" data-end ${myTurn ? "" : "disabled"}>End turn</button>`;
  prompt(r);
}

function prompt(r: Run, targetId: string | null = null) {
  const s = r.s, p = $("#prompt");
  if (!p) return;
  if (s.phase === "over") { p.innerHTML = s.result === "win" ? "<b>You win!</b>" : "<b>You lose.</b>"; return; }
  if (r.busy || s.phase === "enemy") { p.innerHTML = "Enemy turn. Watch each plan play out."; return; }
  const c = r.selected;
  if (c) {
    const o = ownerOf(s, c);
    const t = cardTarget(c);
    const ask = t === "self" ? `Tap ${esc(o.name)} to play it.` : t === "enemy" ? "Tap an enemy." : "Tap one of your monsters.";
    p.innerHTML = `<b>${esc(cardName(c))}</b> (${esc(o.name)}): ${esc(cardText(s, c, targetId, T()))} <span class="ask">${ask}</span>`;
    return;
  }
  if (s.turn === 1) p.innerHTML = `<b>How to play:</b> tap a card, then its target. The corner number is its energy cost. Enemy plans show above them.`;
  else if (s.energy === 0 || !s.hand.some(x => !cannotPlay(s, x))) p.innerHTML = `Nothing left to play. Press <b>End turn</b>.`;
  else p.innerHTML = `Your turn. <b>${s.energy}</b> energy left.`;
}

const log = (r: Run, html: string) => { if (r.alive) $("#blog")?.insertAdjacentHTML("afterbegin", `<li>${html}</li>`); };

/* ---------- Effects ---------- */

const bodyOf = (id: string) => $(`[data-fid="${id}"] .ph-body`);

function float(id: string, text: string, cls = "") {
  const host = $("#phFx"), el = bodyOf(id);
  if (!host || !el) return;
  const h = host.getBoundingClientRect(), b = el.getBoundingClientRect();
  const d = document.createElement("div");
  d.className = "dmg " + cls;
  d.textContent = text;
  d.style.left = b.left - h.left + b.width / 2 + "px";
  d.style.top = b.top - h.top + b.height * 0.3 + "px";
  host.appendChild(d);
  d.animate([{ transform: "translate(-50%, 0) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -16px) scale(1.1)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%, -56px)", opacity: 0 }],
    { duration: 1000 / S.speed, easing: "ease-out" }).finished.then(() => d.remove(), () => d.remove());
}

function shake(id: string) {
  bodyOf(id)?.animate([{ transform: "none", filter: "none" }, { transform: "translateX(-6px) rotate(-3deg)", filter: "brightness(2.2)" }, { transform: "translateX(6px) rotate(3deg)" }, { transform: "none", filter: "none" }], { duration: 300 / S.speed });
}

function lunge(id: string, down: boolean) {
  bodyOf(id)?.animate([{ transform: "none" }, { transform: `translateY(${down ? 18 : -18}px) scale(1.06)` }, { transform: "none" }], { duration: 360 / S.speed, easing: "ease-in-out" });
}

const nameOf = (s: HandState, id: string) => esc([...s.mine, ...s.theirs].find(f => f.id === id)?.name ?? "");

/** Shows what happened. The DOM already holds the new state; floats and shakes play on top of it. */
function showEvents(r: Run, ev: HandEvent[]) {
  if (!r.alive) return;
  const s = r.s;
  for (const e of ev) {
    if (e.kind === "hit") {
      float(e.to, e.dmg ? `-${e.dmg}` : "Blocked", e.effect === "super" ? "big" : "");
      shake(e.to);
      let msg = e.selfHit ? `<b>${nameOf(s, e.from)}</b> trips and hits itself for ${e.dmg}!` : `<b>${nameOf(s, e.from)}</b> hits ${nameOf(s, e.to)} for ${e.dmg}${e.blocked ? ` (${e.blocked} blocked)` : ""}.`;
      if (e.effect === "super") msg += " Super effective!";
      if (e.effect === "weak") msg += " Not very effective.";
      log(r, msg);
    } else if (e.kind === "block") { float(e.id, `+${e.amount} block`, "blk"); log(r, `${nameOf(s, e.id)} gains ${e.amount} block.`); }
    else if (e.kind === "heal") { float(e.id, `+${e.amount}`, "heal"); log(r, `${nameOf(s, e.id)} heals ${e.amount}.`); }
    else if (e.kind === "burn") { float(e.id, `-${e.dmg}`, "burn"); shake(e.id); log(r, `${nameOf(s, e.id)} burns for ${e.dmg}.`); }
    else if (e.kind === "thorns") { float(e.id, `-${e.dmg}`); log(r, `Spikes hurt ${nameOf(s, e.id)} for ${e.dmg}.`); }
    else if (e.kind === "charge") { float(e.id, "Charging!", "big"); log(r, `${nameOf(s, e.id)} is charging up. Its next attack does double damage.`); }
    else if (e.kind === "status") float(e.id, e.text, "blk");
    else if (e.kind === "ko") log(r, `<b>${nameOf(s, e.id)}</b> is knocked out!${e.mine ? " Its cards are now Fainted." : ""}`);
    else if (e.kind === "reshuffle") log(r, "Discard pile shuffled into the draw pile.");
  }
}

/* ---------- Flow ---------- */

async function play(r: Run, c: ActionCard, targetId: string) {
  r.selected = null;
  const ev = playCard(r.s, c, targetId, T(), Math.random);
  render(r);
  showEvents(r, ev);
  if (r.s.phase === "over") await finish(r);
}

async function enemyTurn(r: Run) {
  const s = r.s;
  r.busy = true;
  r.selected = null;
  const burns = beginEnemyPhase(s, T());
  render(r);
  showEvents(r, burns);
  await wait(r, burns.length ? 650 : 300);
  for (const e of s.theirs) {
    if (!r.alive || s.phase !== "enemy") break;
    if (e.hp <= 0 || !e.intent) continue;
    $(`[data-fid="${e.id}"]`)?.classList.add("acting");
    const attacking = e.intent.kind === "attack";
    if (attacking) lunge(e.id, true);
    await wait(r, attacking ? 300 : 150);
    if (!r.alive) return;
    const ev = enemyAct(s, e.id, T(), Math.random);
    render(r);
    $(`[data-fid="${e.id}"]`)?.classList.add("acting");
    showEvents(r, ev);
    await wait(r, 650);
    if (!r.alive) return;
  }
  if (s.phase === "enemy") {
    const ev = finishEnemyPhase(s, T(), Math.random);
    r.busy = false;
    render(r);
    showEvents(r, ev);
  }
  r.busy = false;
  if (s.phase === "over") await finish(r);
  else render(r);
}

async function finish(r: Run) {
  render(r);
  log(r, r.s.endReason === "knockouts" ? (r.s.result === "win" ? "You win!" : "You lose.") : `${r.s.result === "win" ? "You win" : "You lose"}: ${esc(r.s.endReason)}.`);
  await wait(r, 1100);
  if (!r.alive || run !== r) return;
  finishBattle(r.s.opp, r.s.result === "win", r.s.turn);
}

/* ---------- Input ---------- */

function onClick(ev: MouseEvent) {
  const r = run;
  if (!r || !r.alive) return;
  const btn = (ev.target as HTMLElement).closest("button");
  const d = btn?.dataset ?? {};
  const s = r.s;
  if (d.mode) return switchMode(d.mode as BattleMode, s.opp);
  if (d.speed) {
    S.speed = Number(d.speed); setSpeed(S.speed); save();
    document.querySelectorAll<HTMLElement>(".p-hand [data-speed]").forEach(x => x.setAttribute("aria-pressed", String(Number(x.dataset.speed) === S.speed)));
    return;
  }
  if (d.winnow !== undefined) return finishBattle(s.opp, true, s.turn, true);
  if (s.phase !== "player" || r.busy) return;
  if (d.card) {
    const c = s.hand.find(x => String(x.uid) === d.card);
    if (!c) return;
    if (r.selected === c) { r.selected = null; return render(r); }
    const why = cannotPlay(s, c);
    if (why) { r.selected = null; render(r); $("#prompt")!.innerHTML = `${esc(why)}.`; return; }
    r.selected = c;
    return render(r);
  }
  if (d.target && r.selected) {
    const c = r.selected;
    const ok = cardTarget(c) === "self" ? d.target === c.owner : validTargets(s, c).includes(d.target);
    if (ok) return void play(r, c, d.target);
  }
  if (d.end !== undefined) return void enemyTurn(r);
  if (r.selected) { r.selected = null; render(r); }
}

/** Desktop: hovering a target previews the card's exact effect on it. */
function onHover(ev: MouseEvent) {
  const r = run;
  if (!r?.selected || r.busy) return;
  const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-target]");
  prompt(r, t && validTargets(r.s, r.selected).includes(t.dataset.target!) ? t.dataset.target! : null);
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === "Escape" && run?.selected) { run.selected = null; render(run); }
}
