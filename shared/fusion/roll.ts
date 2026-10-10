import type { Ability, Card, FusionOutcome, Rng, Tuning } from "../types.js";
import { ABILITIES, clampAbility } from "../data/abilities.js";
import { newId, pickOne } from "../rng.js";
import { mockFusionText } from "./mockText.js";
import { crossAncestry } from "./ancestry.js";

export interface FusionResult {
  child: Card;
  outcome: FusionOutcome;
  /** Average of the two parents, for showing how the roll went. */
  base: { hp: number; atk: number; spd: number };
}

/** Code decides stats, the outcome roll and the ability. Name and flavor start as a mock and can be replaced by AI text. */
export function fuse(a: Card, b: Card, T: Tuning, rng: Rng = Math.random): FusionResult {
  const r = rng() * 100;
  const outcome: FusionOutcome = r < T.critChance ? "crit" : r < T.critChance + T.botchChance ? "botch" : "normal";
  const mut = () => (T.mutMin + rng() * (T.mutMax - T.mutMin)) / 100;
  const k = outcome === "crit" ? 1.35 : outcome === "botch" ? 0.6 : 1;
  const mix = (x: number, y: number) => Math.max(1, Math.round(((x + y) / 2) * (1 + mut()) * k));
  const els = [...new Set([a.els[0], b.els[0]])];

  let ab: Ability;
  if (outcome === "botch") ab = { type: "clumsy", v: 0 };
  else {
    const usable = [a.ab, b.ab].filter(x => x.type !== "clumsy");
    const src = usable.length ? pickOne(rng, usable) : a.ab;
    const v = ABILITIES[src.type].hasValue ? src.v * (1 + mut()) * (outcome === "crit" ? 1.5 : 1) : 0;
    ab = clampAbility({ type: src.type, v });
  }

  const p = <T>(x: T, y: T) => (rng() < 0.5 ? x : y);
  const look = {
    h1: a.look.h1, h2: b.look.h1, body: p(a.look.body, b.look.body),
    eyes: outcome === "botch" ? 1 + Math.floor(rng() * 3) : p(a.look.eyes, b.look.eyes),
    eyeSize: outcome === "botch" ? 10 : Math.round((a.look.eyeSize + b.look.eyeSize) / 2),
    horns: outcome === "crit" ? Math.max(1, p(a.look.horns, b.look.horns)) : p(a.look.horns, b.look.horns),
    tail: a.look.tail || b.look.tail ? 1 : 0, mouth: p(a.look.mouth, b.look.mouth),
    wonky: outcome === "botch", aura: outcome === "crit",
  };
  const text = mockFusionText(a, b, outcome, rng);
  const child: Card = {
    id: newId(), name: text.name, els, maxHp: mix(a.maxHp, b.maxHp), atk: mix(a.atk, b.atk),
    spd: Math.min(12, mix(a.spd, b.spd)), ab, look, flavor: text.flavor, gen: Math.max(a.gen, b.gen) + 1, outcome,
    ancestry: crossAncestry(a, b, T),
  };
  return { child, outcome, base: { hp: (a.maxHp + b.maxHp) / 2, atk: (a.atk + b.atk) / 2, spd: (a.spd + b.spd) / 2 } };
}
