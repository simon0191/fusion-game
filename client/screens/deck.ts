import type { Tuning } from "../../shared/types.js";
import { DEFAULT_TUNING } from "../../shared/tuning.js";
import { DECK_MAX, S, resetGame, save, type BattleMode } from "../state/store.js";
import { closeScreen, openScreen } from "../router.js";
import { cardHTML } from "../battle/cards.js";
import { duckMusic } from "../audio/music.js";
import { allSamples, allSounds, cry, jingles, sample, sfx, type SampleName, type SoundName } from "../audio/sfx.js";
import { MODE_NAMES } from "../battle/modes.js";

const MENU_MODES: BattleMode[] = ["classic", "tactics", "rush"];

type NumKey = { [K in keyof Tuning]: Tuning[K] extends number ? K : never }[keyof Tuning];
const FIELDS: [NumKey, string, number, number, number, (v: number) => string][] = [
  ["dmgMult", "Damage multiplier", 0.5, 2, 0.05, v => v.toFixed(2) + "×"],
  ["turnLimit", "Turn limit per battle", 3, 10, 1, v => String(v)],
  ["kosToWin", "Knockouts needed to win", 1, 3, 1, v => String(v)],
  ["tapPerfectBonus", "Perfect tap: extra damage", 0, 100, 5, v => "+" + v + "%"],
  ["tapGoodBonus", "Good tap: extra damage", 0, 60, 5, v => "+" + v + "%"],
  ["tapMissPenalty", "Missed tap: damage lost", 0, 80, 5, v => "-" + v + "%"],
  ["blockPerfect", "Perfect block: damage blocked", 0, 90, 5, v => v + "%"],
  ["blockGood", "Good block: damage blocked", 0, 60, 5, v => v + "%"],
  ["mutMin", "Fusion stat roll, worst", -60, 0, 5, v => v + "%"],
  ["mutMax", "Fusion stat roll, best", 0, 80, 5, v => "+" + v + "%"],
  ["critChance", "Critical fusion chance", 0, 40, 1, v => v + "%"],
  ["botchChance", "Botched fusion chance", 0, 40, 1, v => v + "%"],
];

export function showDeck() {
  const st = S.stats;
  const avg = st.turns.length ? (st.turns.reduce((a, b) => a + b, 0) / st.turns.length).toFixed(1) : "-";
  const taps = st.perfect + st.good + st.miss;
  const pct = (n: number) => (taps ? Math.round((n / taps) * 100) + "%" : "-");
  duckMusic(true);
  const o = openScreen(`<div class="screen">
    <div class="topbar"><h2 class="big-title" style="font-size:26px">Your deck</h2><button class="btn primary" type="button" data-close ${S.party.length === 3 ? "" : "disabled"}>Done</button></div>
    <p class="hint">${S.deck.length}/${DECK_MAX} cards. Tap cards to choose your party of 3.${S.party.length === 3 ? "" : ` <b style="color:var(--accent)">Pick ${3 - S.party.length} more.</b>`}</p>
    <div class="deck">${S.deck.map(c => {
      const pi = S.party.indexOf(c.id);
      return cardHTML(c, { tag: "button", attrs: `type="button" data-party="${c.id}"`, selected: pi >= 0, badge: pi >= 0 ? `Party ${pi + 1}` : "" });
    }).join("")}</div>
    <div class="panel">
      <h2 class="section-title">Battle mode</h2>
      <div class="seg" role="group" aria-label="Battle mode">${MENU_MODES.map(m => `<button type="button" data-mode="${m}" aria-pressed="${S.battleMode === m}">${MODE_NAMES[m]}</button>`).join("")}</div>
      <span class="hint">Used for your next battle.</span>
    </div>
    <div class="panel">
      <h2 class="section-title">Playtest stats</h2>
      <div class="statgrid">
        <div><b>${st.battles}</b><span>Battles</span></div>
        <div><b>${st.battles ? Math.round((st.wins / st.battles) * 100) + "%" : "-"}</b><span>Win rate</span></div>
        <div><b>${avg}</b><span>Avg turns</span></div>
        <div><b>${pct(st.perfect)}</b><span>Perfect taps</span></div>
        <div><b>${pct(st.good)}</b><span>Good taps</span></div>
        <div><b>${pct(st.miss)}</b><span>Missed taps</span></div>
        <div><b>${st.crit}</b><span>Crit fusions</span></div>
        <div><b>${st.normal}</b><span>Normal</span></div>
        <div><b>${st.botch}</b><span>Botched</span></div>
      </div>
      <span class="hint">Battles only count with "Always win" off. Target: battles end in 3 to 5 turns.</span>
    </div>
    <details class="panel">
      <summary>Tuning</summary>
      <div class="tune">${FIELDS.map(([k, label, min, max, step, fmt]) =>
        `<label for="t-${k}">${label}<output id="o-${k}">${fmt(S.tuning[k])}</output><input id="t-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${S.tuning[k]}" data-tune="${k}"></label>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small" type="button" data-defaults>Default tuning</button>
        <button class="btn small" type="button" data-reset>Reset deck and stats</button>
      </div>
    </details>
    <details class="panel">
      <summary>Sound test</summary>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${allSounds.map(n => `<button class="btn small" type="button" data-sound="${n}">${n}</button>`).join("")}
        ${allSamples.map(n => `<button class="btn small" type="button" data-sample="${n}">${n} (recorded)</button>`).join("")}
        ${Object.keys(jingles).map(n => `<button class="btn small" type="button" data-jingle="${n}">${n} (jingle)</button>`).join("")}
        ${S.deck.map(c => `<button class="btn small" type="button" data-cry="${c.id}">${c.name} (cry)</button>`).join("")}
      </div>
    </details>
  </div>`);
  o.onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!t) return;
    const d = t.dataset;
    if (d.sound) sfx(d.sound as SoundName);
    else if (d.sample) void sample(d.sample as SampleName);
    else if (d.jingle) jingles[d.jingle as keyof typeof jingles]();
    else if (d.cry) cry(S.deck.find(c => c.id === d.cry)!);
    else if (d.party) {
      const i = S.party.indexOf(d.party);
      sfx(i >= 0 ? "deselect" : "select");
      if (i >= 0) S.party.splice(i, 1);
      else { if (S.party.length >= 3) S.party.shift(); S.party.push(d.party); }
      save(); keepOpen();
    } else if (d.mode) { S.battleMode = d.mode as BattleMode; save(); keepOpen(); }
    else if (d.close !== undefined) closeScreen();
    else if (d.defaults !== undefined) { S.tuning = { ...DEFAULT_TUNING, alwaysWin: S.tuning.alwaysWin }; save(); keepOpen(); }
    else if (d.reset !== undefined) { resetGame(); keepOpen(); }
  };
  o.oninput = e => {
    const el = e.target as HTMLInputElement, k = el.dataset.tune as NumKey | undefined;
    if (!k) return;
    S.tuning[k] = Number(el.value);
    if (k === "mutMin" && S.tuning.mutMin > S.tuning.mutMax) S.tuning.mutMax = S.tuning.mutMin;
    o.querySelector(`#o-${k}`)!.textContent = FIELDS.find(f => f[0] === k)![5](S.tuning[k]);
    save();
  };
}

/** Re-renders in place, keeping the scroll position and the tuning panel state. */
function keepOpen() {
  const o = document.querySelector<HTMLElement>("#overlay")!;
  const y = o.scrollTop, open = o.querySelector("details")?.open;
  showDeck();
  o.scrollTop = y;
  const det = o.querySelector("details");
  if (det && open) det.open = true;
}
