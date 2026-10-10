import "../../styles/proto-rush.css";
import type { Opponent, Side } from "../../../shared/types.js";
import type { Fighter } from "../../../shared/battle/engine.js";
import { koCount } from "../../../shared/battle/engine.js";
import { RUSH, SPECIAL_NAMES, type RushEvent, type RushInput, type RushState, active, canSwap, chargeLevel, createRush, step } from "../../../shared/battle/protos/rush.js";
import { ELEMENTS } from "../../../shared/data/elements.js";
import { ABILITIES } from "../../../shared/data/abilities.js";
import { S, partyCards, type BattleMode } from "../../state/store.js";
import { openScreen } from "../../router.js";
import { $, esc } from "../../util.js";
import { hpClass, monsterArt } from "../cards.js";
import { animAttack, enterFx, floatText, hitFx, koFx, setSpeed, setupFx } from "../fx.js";
import { type BattleMechanic, finishBattle, modeBarHTML, switchMode } from "../modes.js";
import { castSound, cry, hitSound, sfx } from "../../audio/sfx.js";
import { muteButtonHTML } from "../../audio/engine.js";

const COUNTDOWN_MS = 3000;
const STEP_MS = 20;
/** A tap this close to a full bar is kept and fires as soon as the bar fills. */
const BUFFER_BAR = 0.8;

interface Run {
  s: RushState;
  phase: "countdown" | "live" | "done";
  countdown: number;
  raf: number;
  last: number;
  pending: RushInput;
  queuedTap: boolean;
  pressAt: number;
  pointer: number | null;
  shown: Record<Side, Fighter>;
  koAt: Record<Side, number>;
  timers: number[];
  cleanup: (() => void)[];
  text: Record<string, string>;
}

let run: Run | null = null;

export const rush: BattleMechanic = { start, stop };

function start(opp: Opponent) {
  stop();
  const s = createRush(partyCards(), opp);
  run = {
    s, phase: "countdown", countdown: COUNTDOWN_MS, raf: 0, last: performance.now(), pending: {}, queuedTap: false, pressAt: 0, pointer: null,
    shown: { mine: active(s.mine), theirs: active(s.theirs) }, koAt: { mine: -1e9, theirs: -1e9 }, timers: [], cleanup: [], text: {},
  };
  setSpeed(1);
  const o = openScreen(screenHTML(s));
  o.classList.add("battle-mode");
  o.onclick = onClick;
  setupFx();
  bind(run);
  run.raf = requestAnimationFrame(frame);
}

/** Cancels the loop, timers and listeners. A stopped battle never reports a result. */
function stop() {
  const r = run;
  if (!r) return;
  run = null;
  cancelAnimationFrame(r.raf);
  r.timers.forEach(t => clearTimeout(t));
  r.cleanup.forEach(f => f());
  const o = $("#overlay");
  if (o?.onclick === onClick) o.onclick = null;
}

function later(r: Run, ms: number, f: () => void) {
  r.timers.push(window.setTimeout(() => { if (run === r) f(); }, ms));
}

const seconds = (s: RushState) => Math.max(1, Math.round(s.t / 1000));

function finish(r: Run) {
  const { opp, result } = r.s;
  const secs = seconds(r.s);
  stop();
  finishBattle(opp, result === "win", secs, r.s.theirs.team);
}

/* ---------- Loop ---------- */

function frame(now: number) {
  const r = run;
  if (!r) return;
  r.raf = requestAnimationFrame(frame);
  const dt = Math.min(50, now - r.last);
  r.last = now;
  if (document.hidden) return;
  if (r.phase === "countdown") {
    r.countdown -= dt;
    if (r.countdown <= 0) {
      r.phase = "live";
      $("#rHowto")?.remove();
      call("Go!", "go");
    } else setText(r, "count", "#rCount", String(Math.ceil(r.countdown / 1000)));
  } else if (r.phase === "live") {
    const s = r.s;
    if (r.queuedTap && s.mine.bar >= 1 && !s.needPick) { r.pending.down = true; r.pending.up = true; r.queuedTap = false; }
    let inp = r.pending;
    r.pending = {};
    for (let left = dt; left > 0 && !s.over; left -= STEP_MS) {
      play(r, step(s, Math.min(STEP_MS, left), inp, S.tuning, Math.random));
      inp = {};
      if (run !== r) return;
    }
    if (s.over) {
      r.phase = "done";
      later(r, 1400, () => finish(r));
    }
  }
  paint(r);
}

function play(r: Run, events: RushEvent[]) {
  for (const e of events) {
    switch (e.kind) {
      case "hit": {
        const a = r.shown[e.from];
        if (e.move !== "counter" || e.dmg > 0) void animAttack(e.from, e.to, ELEMENTS[a.els[0]].color, e.selfHit);
        castSound(a.els[0]);
        const h = { ...e, shielded: e.block === "half" };
        later(r, e.selfHit ? 200 : 330, () => hitSound(a.els[0], h));
        floatText(e.to, e.dmg ? `-${e.dmg}` : "Blocked", e.crit || e.effect === "super" || e.charge > 0.6 ? "big" : "");
        void hitFx(e.to);
        if (e.crit) call("Lucky hit!", "crit");
        else if (e.move === "counter") call("Counter!", "good");
        else if (e.from === "mine" && e.charge >= 0.99) call("Full charge!", "good");
        else if (e.effect === "super" && e.move !== "special") call("Super effective!", "");
        break;
      }
      case "heal": sfx("heal"); floatText(e.side, `+${e.amount}`, "heal"); break;
      case "thorns": sfx("thorns"); floatText(e.side, `-${e.dmg}`, "thorn"); break;
      case "burn": sfx("hitFire", { vol: .4 }); floatText(e.side, `-${e.dmg}`, "burn"); void hitFx(e.side); break;
      case "ko":
        r.koAt[e.side] = performance.now();
        sfx("ko");
        { const f = r.s[e.side].team.find(x => x.id === e.id); if (f) cry(f, { rate: .7, delay: .1 }); }
        void koFx(e.side);
        break;
      case "block":
        if (e.grade === "perfect") { sfx("blockPerfect"); call("Perfect block!", "perfect"); }
        else if (e.grade === "half") { sfx("blockGood"); call("Blocked!", "good"); }
        else { sfx("miss"); call("Too early", "miss"); }
        break;
      case "chargeBroken": sfx("miss"); call("Charge broken!", "miss"); break;
      case "special": sfx("tapPerfect"); call(`${e.side === "theirs" ? "Enemy " : ""}${SPECIAL_NAMES[e.type]}!`, e.side === "mine" ? "special" : "foe"); break;
      case "swap": {
        const side = e.side;
        const wait = performance.now() - r.koAt[side] < 800 ? 750 : 0;
        if (side === "mine") r.queuedTap = false;
        sfx("enter");
        { const f = r.s[side].team.find(x => x.id === e.id); if (f) cry(f, { delay: .15 }); }
        if (wait) later(r, wait, () => showSide(r, side));
        else showSide(r, side);
        break;
      }
      case "end": call(e.win ? "You win!" : "You lose", e.win ? "perfect" : "miss"); break;
      case "windup": sfx("ring"); break;
      case "needPick": break;
    }
  }
}

/* ---------- Markup ---------- */

const tagsOf = (s: RushState, side: Side) => {
  const x = s[side], t: string[] = [];
  if (x.burnMs > 0) t.push(`<span class="r-tag burn">Burn</span>`);
  if (x.shieldMs > 0) t.push(`<span class="r-tag shield">Shell ${Math.ceil(x.shieldMs / 1000)}</span>`);
  if (x.thornsMs > 0) t.push(`<span class="r-tag thorns">Spikes ${Math.ceil(x.thornsMs / 1000)}</span>`);
  return t.join("");
};

const plateHTML = (f: Fighter, side: Side) => `
  <div class="pn">${esc(f.name)}<span class="r-hp">${f.hp}/${f.maxHp}</span></div>
  <div class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></div>
  <div class="r-meters">
    <div class="r-act" title="Action bar"><span></span></div>
    <div class="r-sp" title="Special meter"><span></span></div>
  </div>
  <div class="r-tags" data-tags="${side}"></div>`;

const slotHTML = (f: Fighter, side: Side) =>
  `<div class="mon" id="${side === "mine" ? "monMine" : "monTheirs"}">${monsterArt(f)}</div>${side === "theirs" ? `<div class="r-wind"></div>` : `<div class="r-charge"></div>`}`;

const benchHTML = (s: RushState) => s.mine.team.map((f, i) => `
  <button type="button" class="mchip r-chip" data-swap="${i}" style="--el:${ELEMENTS[f.els[0]].color}" aria-label="Swap to ${esc(f.name)}">
    ${monsterArt(f)}<span class="mn">${esc(f.name)}</span><span class="r-key">${i + 1}</span>
    <span class="hpbar"><span style="width:${(f.hp / f.maxHp) * 100}%"></span></span><span class="r-cd"></span>
  </button>`).join("");

const foesHTML = (s: RushState) => s.theirs.team.map(f => `
  <div class="r-foe" style="--el:${ELEMENTS[f.els[0]].color}" title="${esc(f.name)}">${monsterArt(f)}<span class="hpbar"><span style="width:100%"></span></span></div>`).join("");

function screenHTML(s: RushState) {
  const T = S.tuning;
  return `<div class="battle p-rush">
    <div class="bbar">
      <div class="row1">
        <div class="score"><span class="r-time" id="rTime">${fmtTime(RUSH.timeLimitMs)}</span><span>Your KOs <b id="rMyKO">0</b>/${T.kosToWin}</span><span>Their KOs <b id="rTheirKO">0</b>/${T.kosToWin}</span></div>
        ${S.tuning.alwaysWin ? `<button type="button" class="winnow" data-winnow>Win now</button>` : ""}
      </div>
      <div class="row2">${modeBarHTML()}<div class="seg">${muteButtonHTML("")}</div></div>
    </div>
    <div class="r-foes"><span class="oppname">${esc(s.opp.name)}</span>${foesHTML(s)}</div>
    <div class="arena" id="arena">
      <div class="plate theirs">${plateHTML(active(s.theirs), "theirs")}</div>
      <div class="plate mine">${plateHTML(active(s.mine), "mine")}</div>
      <div class="slot theirs">${slotHTML(active(s.theirs), "theirs")}</div>
      <div class="slot mine">${slotHTML(active(s.mine), "mine")}</div>
      <div class="r-howto" id="rHowto">
        <p><b>Tap</b> the arena (Space) to attack when your bar is full. <b>Hold</b> to charge.</p>
        <p>When the enemy glows, hit <b>Block</b> (B) as the ring turns gold for a perfect block.</p>
        <p><b>Special</b> (S) when its meter is full. Tap a bench monster (1-3) to swap.</p>
        <div class="r-count" id="rCount">3</div>
      </div>
      <div class="r-call" id="rCall"></div>
      <canvas id="fx"></canvas>
    </div>
    <div class="prompt" id="prompt">${esc(s.opp.name)}: "${esc(s.opp.line)}"</div>
    <div class="team mine r-bench">${benchHTML(s)}</div>
    <div class="r-controls">
      <button type="button" class="r-btn r-block" data-act="block">Block<small>B / Shift</small></button>
      <button type="button" class="r-btn r-attack" data-act="attack"><span class="r-fill"></span><span class="r-lbl">Attack<small>Space, hold to charge</small></span></button>
      <button type="button" class="r-btn r-special" data-act="special"><span class="r-fill"></span><span class="r-lbl"><span id="rSpName"></span><small>S</small></span></button>
    </div>
  </div>`;
}

function showSide(r: Run, side: Side) {
  const f = active(r.s[side]);
  r.shown[side] = f;
  const slot = $(`.p-rush .slot.${side}`), plate = $(`.p-rush .plate.${side}`);
  if (slot) slot.innerHTML = slotHTML(f, side);
  if (plate) plate.innerHTML = plateHTML(f, side);
  delete r.text[`tags-${side}`];
  void enterFx(side);
}

/* ---------- Per-frame paint ---------- */

const fmtTime = (ms: number) => { const sec = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };

function setText(r: Run, key: string, sel: string, v: string, html = false) {
  if (r.text[key] === v) return;
  const el = $(sel);
  if (!el) return;
  r.text[key] = v;
  if (html) el.innerHTML = v; else el.textContent = v;
}

function paint(r: Run) {
  const s = r.s;
  setText(r, "time", "#rTime", fmtTime(RUSH.timeLimitMs - s.t));
  setText(r, "myko", "#rMyKO", String(koCount(s.theirs.team)));
  setText(r, "theirko", "#rTheirKO", String(koCount(s.mine.team)));
  const root = $(".p-rush");
  if (!root) return;

  for (const side of ["mine", "theirs"] as Side[]) {
    const x = s[side], f = r.shown[side], plate = root.querySelector<HTMLElement>(`.plate.${side}`);
    if (!plate) continue;
    const fresh = f === active(x);
    plate.querySelector(".r-hp")!.textContent = `${f.hp}/${f.maxHp}`;
    const hp = plate.querySelector<HTMLElement>(".hpbar span")!;
    hp.style.width = (f.hp / f.maxHp) * 100 + "%";
    hp.className = hpClass(f);
    const bar = fresh ? x.bar : 0;
    const act = plate.querySelector<HTMLElement>(".r-act")!;
    act.style.setProperty("--v", String(bar));
    act.classList.toggle("full", bar >= 1);
    const sp = plate.querySelector<HTMLElement>(".r-sp")!;
    sp.style.setProperty("--v", String(x.special));
    sp.classList.toggle("full", x.special >= 1);
    setText(r, `tags-${side}`, `.p-rush [data-tags="${side}"]`, fresh ? tagsOf(s, side) : "", true);
  }

  const wind = s.wind, windT = wind ? wind.ms / RUSH.windMs : 0;
  const inWindow = !!wind && RUSH.windMs - wind.ms <= RUSH.perfectMs;
  const ts = root.querySelector<HTMLElement>(".slot.theirs")!;
  ts.classList.toggle("winding", !!wind);
  ts.classList.toggle("now", inWindow);
  ts.style.setProperty("--w", String(windT));
  root.querySelector(".arena")!.classList.toggle("r-danger", !!wind);

  const charging = s.holding && s.mine.bar >= 1 && !s.needPick;
  const ms = root.querySelector<HTMLElement>(".slot.mine")!;
  ms.classList.toggle("charging", charging);
  ms.style.setProperty("--c", String(chargeLevel(s)));

  const blockBtn = root.querySelector<HTMLElement>(".r-block")!;
  blockBtn.classList.toggle("hot", !!wind && !wind.block);
  blockBtn.classList.toggle("now", inWindow && !wind!.block);
  blockBtn.classList.toggle("cool", s.blockCd > 0 || !!wind?.block);

  const atk = root.querySelector<HTMLElement>(".r-attack")!;
  atk.style.setProperty("--v", String(charging ? chargeLevel(s) : s.mine.bar));
  atk.classList.toggle("ready", s.mine.bar >= 1 && !s.needPick);
  atk.classList.toggle("charging", charging);

  const spBtn = root.querySelector<HTMLElement>(".r-special")!;
  spBtn.style.setProperty("--v", String(s.mine.special));
  spBtn.classList.toggle("ready", s.mine.special >= 1 && !s.needPick);
  setText(r, "spname", "#rSpName", SPECIAL_NAMES[active(s.mine).ab.type]);

  root.querySelectorAll<HTMLElement>(".r-chip").forEach((el, i) => {
    const f = s.mine.team[i];
    const bar = el.querySelector<HTMLElement>(".hpbar span")!;
    bar.style.width = (f.hp / f.maxHp) * 100 + "%";
    bar.className = hpClass(f);
    el.classList.toggle("ko", f.hp <= 0);
    el.classList.toggle("active", i === s.mine.active && !s.needPick);
    el.classList.toggle("pickable", s.needPick && f.hp > 0);
    el.classList.toggle("ok", !s.needPick && canSwap(s.mine, i));
    el.style.setProperty("--cd", String(i === s.mine.active ? 0 : s.mine.swapCd / RUSH.swapCdMs));
  });
  root.querySelectorAll<HTMLElement>(".r-foe").forEach((el, i) => {
    const f = s.theirs.team[i];
    const bar = el.querySelector<HTMLElement>(".hpbar span")!;
    bar.style.width = (f.hp / f.maxHp) * 100 + "%";
    bar.className = hpClass(f);
    el.classList.toggle("ko", f.hp <= 0);
    el.classList.toggle("active", i === s.theirs.active);
  });

  setText(r, "prompt", "#prompt", promptText(r), true);
}

function promptText(r: Run) {
  const s = r.s;
  if (r.phase === "countdown") return `${esc(s.opp.name)}: "${esc(s.opp.line)}"`;
  if (s.over) return `Battle over: ${esc(s.endReason)}.`;
  if (s.needPick) return `<b>${esc(r.shown.mine.name)}</b> is knocked out. Pick your next monster.`;
  const foe = active(s.theirs), me = active(s.mine);
  const sp = s.mine.special >= 1 ? ` Special ready: <b>${SPECIAL_NAMES[me.ab.type]}</b>.` : "";
  if (s.wind && !s.wind.block) return RUSH.windMs - s.wind.ms <= RUSH.perfectMs ? `Block <b>now</b>!` : `<b>${esc(foe.name)}</b> is winding up. Block when the ring turns gold!`;
  if (s.holding && s.mine.bar >= 1) return `Charging ×${(1 + (RUSH.chargeMax - 1) * chargeLevel(s)).toFixed(1)}. Let go to hit.`;
  if (s.mine.bar >= 1) return `Ready! Tap to attack, hold to charge.${sp}`;
  return `${esc(me.name)} (${ABILITIES[me.ab.type].name}) vs ${esc(foe.name)} (${ABILITIES[foe.ab.type].name}).${sp}`;
}

function call(text: string, cls: string) {
  const el = $("#rCall");
  if (!el) return;
  const n = document.createElement("div");
  n.className = `r-msg ${cls}`;
  n.textContent = text;
  el.replaceChildren(n);
  n.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.1)", opacity: 1, offset: 0.15 }, { transform: "scale(1)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }], { duration: 900, easing: "ease-out", fill: "forwards" });
}

/* ---------- Input ---------- */

function press(r: Run) {
  if (r.phase !== "live" || r.s.needPick) return;
  r.pending.down = true;
  r.pressAt = performance.now();
}

function release(r: Run) {
  if (r.phase !== "live") return;
  r.pending.up = true;
  const bar = r.s.mine.bar;
  if (bar < 1 && bar >= BUFFER_BAR && performance.now() - r.pressAt < 300) r.queuedTap = true;
}

function act(r: Run, what: string) {
  if (r.phase !== "live") return;
  if (what === "block") r.pending.block = true;
  else if (what === "special") r.pending.special = true;
}

function choose(r: Run, i: number) {
  if (r.phase !== "live" || !r.s.mine.team[i]) return;
  if (r.s.needPick) r.pending.pick = i;
  else r.pending.swap = i;
}

function bind(r: Run) {
  const arena = $("#arena")!, atkBtn = $(".p-rush .r-attack")!;
  const on = <K extends keyof WindowEventMap>(t: Window, type: K, f: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, f, opts);
    r.cleanup.push(() => t.removeEventListener(type, f, opts));
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.currentTarget === arena && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    if (r.pointer !== null) return;
    r.pointer = e.pointerId;
    press(r);
  };
  arena.addEventListener("pointerdown", down);
  atkBtn.addEventListener("pointerdown", down);
  const up = (e: PointerEvent) => {
    if (e.pointerId !== r.pointer) return;
    r.pointer = null;
    release(r);
  };
  on(window, "pointerup", up);
  on(window, "pointercancel", up);

  for (const el of document.querySelectorAll<HTMLElement>(".p-rush [data-act=block], .p-rush [data-act=special]")) {
    el.addEventListener("pointerdown", e => { e.preventDefault(); act(r, el.dataset.act!); });
  }
  $(".p-rush")!.addEventListener("contextmenu", e => e.preventDefault());

  const keyHeld = new Set<string>();
  on(window, "keydown", e => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!keyHeld.has("Space")) { keyHeld.add("Space"); press(r); }
      return;
    }
    if (e.repeat) return;
    if (e.code === "KeyB" || e.code === "ShiftLeft" || e.code === "ShiftRight") act(r, "block");
    else if (e.code === "KeyS") act(r, "special");
    else if (/^Digit[1-3]$/.test(e.code)) choose(r, Number(e.code.slice(5)) - 1);
  });
  on(window, "keyup", e => {
    if (e.code !== "Space") return;
    e.preventDefault();
    keyHeld.delete("Space");
    release(r);
  });
  const letGo = () => {
    if (r.pointer !== null || keyHeld.size) { r.pointer = null; keyHeld.clear(); release(r); }
  };
  on(window, "blur", letGo);
  const vis = () => { if (document.hidden) letGo(); else r.last = performance.now(); };
  document.addEventListener("visibilitychange", vis);
  r.cleanup.push(() => document.removeEventListener("visibilitychange", vis));
  on(window, "resize", () => setupFx());
}

function onClick(e: MouseEvent) {
  const r = run;
  const t = (e.target as HTMLElement).closest("button");
  if (!t || !r) return;
  const d = t.dataset;
  if (d.mode) switchMode(d.mode as BattleMode, r.s.opp);
  else if (d.winnow !== undefined && S.tuning.alwaysWin && !r.s.over) {
    const { opp } = r.s, secs = seconds(r.s);
    stop();
    finishBattle(opp, true, secs, r.s.theirs.team, true);
  } else if (d.swap !== undefined) choose(r, Number(d.swap));
  else if (d.act && e.detail === 0) act(r, d.act);
}
