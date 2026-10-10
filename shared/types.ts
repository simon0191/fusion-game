export type Element = "fire" | "water" | "leaf" | "rock" | "spark" | "shadow";
export type AbilityType = "burn" | "heal" | "double" | "shield" | "quick" | "drain" | "thorns" | "crit" | "clumsy";
export type FusionOutcome = "crit" | "normal" | "botch";
export type Side = "mine" | "theirs";
export type Rng = () => number;

export interface Ability { type: AbilityType; v: number }

/** Parameters for the placeholder monster drawing. Real art will replace this. */
export interface Look {
  h1: number; h2: number; body: number; eyes: number; eyeSize: number;
  horns: number; tail: number; mouth: number; wonky?: boolean; aura?: boolean;
}

export interface Card {
  id: string;
  name: string;
  els: Element[];
  maxHp: number;
  atk: number;
  spd: number;
  ab: Ability;
  look: Look;
  /** Image URL. Cards without one draw `look` instead. */
  art?: string;
  flavor: string;
  gen: number;
  outcome: FusionOutcome | null;
}

export interface CardTemplate {
  name: string; el: Element; hp: number; atk: number; spd: number;
  ab: [AbilityType, number]; look: Look; art: string; flavor: string;
}

/** A trainer. Their team is drawn at random from the base monsters each battle, with stats scaled by `mult`. */
export interface Opponent { id: string; name: string; mult: number; line: string }

export interface Tuning {
  alwaysWin: boolean;
  dmgMult: number;
  turnLimit: number;
  kosToWin: number;
  /** Fusion stat roll range, in percent. */
  mutMin: number;
  mutMax: number;
  critChance: number;
  botchChance: number;
  /** Timing taps: extra damage on your attacks, in percent. */
  tapPerfectBonus: number;
  tapGoodBonus: number;
  /** Timing taps: share of incoming damage blocked, in percent. */
  blockPerfect: number;
  blockGood: number;
}

export type TimingGrade = "perfect" | "good" | "miss";
