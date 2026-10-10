import type { Card, Opponent } from "../../shared/types.js";
import { S, save, type BattleMode } from "../state/store.js";
import { showLost, showReward } from "../screens/after.js";
import { jingles } from "../audio/sfx.js";
import { music } from "../audio/music.js";
import { classic } from "./view.js";
import { tactics } from "./protos/tactics.js";
import { rush } from "./protos/rush.js";
import { hand } from "./protos/hand.js";

/** One way of playing a battle. `stop` cancels any running loop or timers so another mode can take over the screen. */
export interface BattleMechanic { start(opp: Opponent): void; stop(): void }

export const MODE_NAMES: Record<BattleMode, string> = { classic: "Classic", tactics: "Tactics", rush: "Rush", hand: "Hand" };
const MODES: Record<BattleMode, BattleMechanic> = { classic, tactics, rush, hand };

let current: BattleMechanic | null = null;

export function startBattle(opp: Opponent) {
  current?.stop();
  current = MODES[S.battleMode] ?? classic;
  jingles.challenge();
  music("battle");
  current.start(opp);
}

/** Restarts the battle against the same opponent with another mechanic. */
export function switchMode(mode: BattleMode, opp: Opponent) {
  S.battleMode = mode;
  save();
  startBattle(opp);
}

/** Row of buttons for picking the mechanic. Clicks carry `data-mode`; pass them to `switchMode`. */
export const modeBarHTML = () =>
  `<div class="seg" role="group" aria-label="Battle mechanic">${(Object.keys(MODE_NAMES) as BattleMode[]).map(m => `<button type="button" data-mode="${m}" aria-pressed="${S.battleMode === m}">${MODE_NAMES[m]}</button>`).join("")}</div>`;

/**
 * Every mechanic ends here: records stats and the win, then shows the reward or loss screen.
 * `theirs` is the team the opponent fought with; the reward screen offers those cards.
 * `skipped` is for the "Win now" button.
 */
export function finishBattle(opp: Opponent, win: boolean, turns: number, theirs: Card[], skipped = false) {
  current?.stop();
  current = null;
  if (!S.tuning.alwaysWin && !skipped) {
    S.stats.battles++;
    if (win) S.stats.wins++;
    S.stats.turns.push(turns);
  }
  if (win && !S.beaten.includes(opp.id)) S.beaten.push(opp.id);
  save();
  music(null);
  if (win) jingles.victory(); else jingles.defeat();
  if (win) showReward(opp, turns, theirs.map(toCard).map(c => ({ ...c, hp: c.maxHp })));
  else showLost(opp, turns);
}

/** Strips battle-only fields (HP, energy, status) so a prototype's fighter can become a deck card. */
const toCard = ({ id, name, els, maxHp, atk, spd, ab, look, art, flavor, gen, outcome, ancestry }: Card): Card =>
  ({ id, name, els: [...els], maxHp, atk, spd, ab: { ...ab }, look: { ...look }, art, flavor, gen, outcome, ...(ancestry ? { ancestry: { ...ancestry } } : {}) });
