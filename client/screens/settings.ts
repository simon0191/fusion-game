import { DEFAULT_AUDIO, S, save, type AudioSettings, type BattleMode } from "../state/store.js";
import { MODE_NAMES } from "../battle/modes.js";
import { closeScreen, openScreen } from "../router.js";
import { applyVolumes, setMuted } from "../audio/engine.js";
import { cry, sfx } from "../audio/sfx.js";

type VolumeKey = { [K in keyof AudioSettings]: AudioSettings[K] extends number ? K : never }[keyof AudioSettings];
const VOLUMES: [VolumeKey, string][] = [["master", "Master volume"], ["music", "Music"], ["sfx", "Sound effects"]];
const pct = (v: number) => Math.round(v * 100) + "%";
const MENU_MODES: BattleMode[] = ["classic", "tactics", "rush"];

export function showSettings() {
  const o = openScreen(`<div class="screen">
    <div class="topbar"><h2 class="big-title" style="font-size:26px">Settings</h2><button class="btn primary" type="button" data-close>Done</button></div>
    <div class="panel">
      <h2 class="section-title">Sound</h2>
      <label class="toggle"><input type="checkbox" data-set="muted" ${S.muted ? "checked" : ""}> Mute all sound</label>
      <div class="tune">${VOLUMES.map(([k, label]) =>
        `<label for="v-${k}">${label}<output id="o-${k}">${pct(S.audio[k])}</output><input id="v-${k}" type="range" min="0" max="1" step="0.05" value="${S.audio[k]}" data-vol="${k}"></label>`).join("")}</div>
      <label class="toggle"><input type="checkbox" data-set="cries" ${S.audio.cries ? "checked" : ""}> Monster cries</label>
      <div><button class="btn small" type="button" data-defaults>Default sound settings</button></div>
    </div>
    <div class="panel">
      <h2 class="section-title">Battle</h2>
      <div class="seg" role="group" aria-label="Animation speed" style="font-size:13px">Animation speed ${[1, 2, 3].map(s => `<button type="button" data-speed="${s}" aria-pressed="${S.speed === s}">${s}×</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Battle mode" style="font-size:13px">Battle mode ${MENU_MODES.map(m => `<button type="button" data-mode="${m}" aria-pressed="${S.battleMode === m}">${MODE_NAMES[m]}</button>`).join("")}</div>
      <span class="hint">The battle mode applies from your next battle.</span>
      <label class="toggle"><input type="checkbox" data-set="alwaysWin" ${S.tuning.alwaysWin ? "checked" : ""}> Always win (for demos: enemies deal no damage, your hits knock out, all challengers unlocked)</label>
    </div>
  </div>`);

  o.oninput = e => {
    const el = e.target as HTMLInputElement, k = el.dataset.vol as VolumeKey | undefined;
    if (!k) return;
    S.audio[k] = Number(el.value);
    o.querySelector(`#o-${k}`)!.textContent = pct(S.audio[k]);
    applyVolumes();
  };
  o.onchange = e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.vol) { save(); if (el.dataset.vol !== "music") sfx("select"); }
    else if (el.dataset.set === "muted") setMuted(el.checked);
    else if (el.dataset.set === "alwaysWin") { S.tuning.alwaysWin = el.checked; save(); }
    else if (el.dataset.set === "cries") {
      S.audio.cries = el.checked; save();
      if (el.checked && S.deck[0]) cry(S.deck[0]);
    }
  };
  o.onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!t) return;
    if (t.dataset.close !== undefined) closeScreen();
    else if (t.dataset.speed) {
      S.speed = Number(t.dataset.speed); save();
      o.querySelectorAll<HTMLElement>("[data-speed]").forEach(x => x.setAttribute("aria-pressed", String(x === t)));
    } else if (t.dataset.mode) {
      S.battleMode = t.dataset.mode as BattleMode; save();
      o.querySelectorAll<HTMLElement>("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === t)));
    } else if (t.dataset.defaults !== undefined) {
      S.audio = { ...DEFAULT_AUDIO }; save(); applyVolumes();
      showSettings();
    }
  };
}
