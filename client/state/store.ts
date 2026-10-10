import type { Card, Tuning } from "../../shared/types";
import { STARTERS, makeCard } from "../../shared/data/cards";
import { DEFAULT_TUNING } from "../../shared/tuning";

export interface Stats { battles: number; wins: number; turns: number[]; crit: number; normal: number; botch: number; perfect: number; good: number; miss: number }
export interface GameState {
  deck: Card[];
  party: string[];
  beaten: string[];
  stats: Stats;
  tuning: Tuning;
  /** Animation speed in battles. */
  speed: number;
}

const KEY = "fusion-game-v1";
export const DECK_MAX = 8;

const freshStats = (): Stats => ({ battles: 0, wins: 0, turns: [], crit: 0, normal: 0, botch: 0, perfect: 0, good: 0, miss: 0 });

export function freshGame(tuning: Tuning = { ...DEFAULT_TUNING }): GameState {
  const deck = STARTERS.map(t => makeCard(t));
  return { deck, party: deck.slice(0, 3).map(c => c.id), beaten: [], stats: freshStats(), tuning, speed: 1 };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (Array.isArray(s.deck) && s.deck.length) return { ...freshGame(), ...s, tuning: { ...DEFAULT_TUNING, ...s.tuning }, stats: { ...freshStats(), ...s.stats } };
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return freshGame();
}

export const S: GameState = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ }
}

export function resetGame() {
  Object.assign(S, freshGame(S.tuning));
  save();
}

export const byId = (id: string) => S.deck.find(c => c.id === id);
export const partyCards = () => S.party.map(byId).filter((c): c is Card => !!c);
