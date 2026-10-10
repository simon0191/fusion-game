import type { Card, Tuning } from "../../shared/types.js";
import { DECK_START, TEAM_SIZE, randomMonsters } from "../../shared/data/cards.js";
import { DEFAULT_TUNING } from "../../shared/tuning.js";

export interface Stats { battles: number; wins: number; turns: number[]; crit: number; normal: number; botch: number; perfect: number; good: number; miss: number }
/** Volumes are 0 to 1. `cries` turns monster calls on or off. */
export interface AudioSettings { master: number; music: number; sfx: number; cries: boolean }
export const DEFAULT_AUDIO: AudioSettings = { master: 1, music: 1, sfx: 0.8, cries: true };

export interface GameState {
  deck: Card[];
  party: string[];
  beaten: string[];
  stats: Stats;
  tuning: Tuning;
  /** Animation speed in battles. */
  speed: number;
  muted: boolean;
  audio: AudioSettings;
  /** Save format. Saves before version 2 may have "Always win" stuck on from an old default. */
  version: number;
}

const KEY = "fusion-game-v2";
export const DECK_MAX = 8;

const freshStats = (): Stats => ({ battles: 0, wins: 0, turns: [], crit: 0, normal: 0, botch: 0, perfect: 0, good: 0, miss: 0 });

export function freshGame(tuning: Tuning = { ...DEFAULT_TUNING }): GameState {
  const deck = randomMonsters(DECK_START, Math.random);
  return { deck, party: deck.slice(0, TEAM_SIZE).map(c => c.id), beaten: [], stats: freshStats(), tuning, speed: 1, muted: false, audio: { ...DEFAULT_AUDIO }, version: 2 };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (Array.isArray(s.deck) && s.deck.length) {
        const tuning = { ...DEFAULT_TUNING, ...s.tuning };
        if (!(s.version >= 2)) tuning.alwaysWin = false;
        return { ...freshGame(), ...s, tuning, stats: { ...freshStats(), ...s.stats }, audio: { ...DEFAULT_AUDIO, ...s.audio }, version: 2 };
      }
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return freshGame();
}

export const S: GameState = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ }
}

export function resetGame() {
  Object.assign(S, freshGame(S.tuning), { speed: S.speed, muted: S.muted, audio: S.audio });
  save();
}

export const byId = (id: string) => S.deck.find(c => c.id === id);
export const partyCards = () => S.party.map(byId).filter((c): c is Card => !!c);
