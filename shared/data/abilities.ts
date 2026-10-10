import type { Ability, AbilityType } from "../types.js";

export const ABILITIES: Record<AbilityType, { name: string; describe: (v: number) => string; hasValue: boolean; max: number }> = {
  burn: { name: "Burn", describe: v => `Hits deal +${v} damage.`, hasValue: true, max: 12 },
  heal: { name: "Regrow", describe: v => `Heals ${v} HP after attacking.`, hasValue: true, max: 14 },
  double: { name: "Double strike", describe: () => "Attacks twice at 60% power.", hasValue: false, max: 0 },
  shield: { name: "Shell", describe: v => `Takes ${v} less damage per hit.`, hasValue: true, max: 10 },
  quick: { name: "Quick", describe: () => "Always strikes first.", hasValue: false, max: 0 },
  drain: { name: "Drain", describe: () => "Heals half the damage it deals.", hasValue: false, max: 0 },
  thorns: { name: "Thorns", describe: v => `Attackers take ${v} damage.`, hasValue: true, max: 12 },
  crit: { name: "Lucky", describe: () => "30% chance to deal double damage.", hasValue: false, max: 0 },
  clumsy: { name: "Clumsy", describe: () => "30% chance to hit itself instead.", hasValue: false, max: 0 },
};

export const abilityText = (ab: Ability) => `${ABILITIES[ab.type].name}. ${ABILITIES[ab.type].describe(ab.v)}`;

/** Keeps an ability's number inside the range the game allows. */
export function clampAbility(ab: Ability): Ability {
  const spec = ABILITIES[ab.type];
  return { type: ab.type, v: spec.hasValue ? Math.min(spec.max, Math.max(1, Math.round(ab.v))) : 0 };
}
