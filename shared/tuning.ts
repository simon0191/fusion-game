import type { Tuning } from "./types.js";

export const DEFAULT_TUNING: Tuning = {
  alwaysWin: true,
  dmgMult: 1,
  turnLimit: 6,
  kosToWin: 2,
  mutMin: -30,
  mutMax: 40,
  critChance: 10,
  botchChance: 12,
  ancestryMinPct: 20,
  ancestryMax: 3,
  tapPerfectBonus: 50,
  tapGoodBonus: 20,
  blockPerfect: 50,
  blockGood: 25,
};
