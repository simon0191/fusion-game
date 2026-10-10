import type { Card, CardTemplate, Opponent } from "../types.js";
import { newId } from "../rng.js";

export const STARTERS: CardTemplate[] = [
  { name: "Emberpup", el: "fire", hp: 26, atk: 15, spd: 6, ab: ["burn", 3], look: { h1: 18, h2: 350, body: 0, eyes: 2, eyeSize: 7, horns: 0, tail: 1, mouth: 1 }, flavor: "Sneezes sparks when it is happy." },
  { name: "Tidalnewt", el: "water", hp: 30, atk: 13, spd: 5, ab: ["heal", 5], look: { h1: 200, h2: 230, body: 1, eyes: 2, eyeSize: 8, horns: 2, tail: 1, mouth: 0 }, flavor: "Lives in puddles that never dry." },
  { name: "Mossback", el: "leaf", hp: 34, atk: 12, spd: 3, ab: ["shield", 3], look: { h1: 105, h2: 75, body: 3, eyes: 2, eyeSize: 6, horns: 0, tail: 0, mouth: 0 }, flavor: "Birds nest on it. It does not mind." },
  { name: "Zaprat", el: "spark", hp: 22, atk: 16, spd: 9, ab: ["quick", 0], look: { h1: 50, h2: 28, body: 2, eyes: 2, eyeSize: 7, horns: 2, tail: 1, mouth: 1 }, flavor: "Chews through power cables for fun." },
  { name: "Pebblor", el: "rock", hp: 36, atk: 13, spd: 2, ab: ["thorns", 3], look: { h1: 32, h2: 18, body: 3, eyes: 1, eyeSize: 9, horns: 1, tail: 0, mouth: 2 }, flavor: "Was a boulder until last Tuesday." },
];

export const POOL: Record<string, CardTemplate> = {
  cindermoth: { name: "Cindermoth", el: "fire", hp: 24, atk: 16, spd: 7, ab: ["crit", 0], look: { h1: 28, h2: 5, body: 1, eyes: 3, eyeSize: 6, horns: 2, tail: 0, mouth: 0 }, flavor: "Drawn to campfires, and to trouble." },
  gloomcap: { name: "Gloomcap", el: "shadow", hp: 28, atk: 14, spd: 5, ab: ["drain", 0], look: { h1: 275, h2: 300, body: 0, eyes: 1, eyeSize: 10, horns: 0, tail: 0, mouth: 1 }, flavor: "A mushroom that feeds on bad moods." },
  bramblewolf: { name: "Bramblewolf", el: "leaf", hp: 28, atk: 15, spd: 7, ab: ["double", 0], look: { h1: 95, h2: 140, body: 2, eyes: 2, eyeSize: 6, horns: 1, tail: 1, mouth: 1 }, flavor: "Hunts in hedges. Smells like rain." },
  voltfin: { name: "Voltfin", el: "spark", hp: 24, atk: 17, spd: 8, ab: ["crit", 0], look: { h1: 55, h2: 190, body: 1, eyes: 2, eyeSize: 7, horns: 0, tail: 1, mouth: 2 }, flavor: "A fish that learned to bite lightning." },
  grimlet: { name: "Grimlet", el: "shadow", hp: 26, atk: 14, spd: 6, ab: ["thorns", 4], look: { h1: 262, h2: 320, body: 2, eyes: 3, eyeSize: 5, horns: 1, tail: 1, mouth: 1 }, flavor: "Hides under beds. Bites ankles." },
  boulderox: { name: "Boulderox", el: "rock", hp: 40, atk: 13, spd: 2, ab: ["shield", 4], look: { h1: 35, h2: 15, body: 3, eyes: 2, eyeSize: 5, horns: 1, tail: 1, mouth: 0 }, flavor: "Takes a week to turn around." },
  frostkoi: { name: "Frostkoi", el: "water", hp: 28, atk: 14, spd: 6, ab: ["double", 0], look: { h1: 190, h2: 170, body: 0, eyes: 2, eyeSize: 8, horns: 2, tail: 1, mouth: 2 }, flavor: "Its scales are cold to the touch." },
  ashdrake: { name: "Ashdrake", el: "fire", hp: 32, atk: 17, spd: 5, ab: ["burn", 5], look: { h1: 8, h2: 330, body: 1, eyes: 2, eyeSize: 6, horns: 1, tail: 1, mouth: 1 }, flavor: "A small dragon with a big temper." },
  stormjaw: { name: "Stormjaw", el: "spark", hp: 30, atk: 18, spd: 7, ab: ["double", 0], look: { h1: 45, h2: 260, body: 3, eyes: 2, eyeSize: 7, horns: 2, tail: 1, mouth: 1 }, flavor: "Thunder follows it home." },
  thornlord: { name: "Thornlord", el: "leaf", hp: 36, atk: 15, spd: 4, ab: ["thorns", 5], look: { h1: 120, h2: 20, body: 2, eyes: 1, eyeSize: 9, horns: 1, tail: 0, mouth: 1 }, flavor: "The oldest bush in the forest." },
};

export const OPPONENTS: Opponent[] = [
  { id: "tim", name: "Bug Catcher Tim", mult: 0.8, cards: ["cindermoth", "bramblewolf", "frostkoi"], line: "My bugs are the best bugs!" },
  { id: "rosa", name: "Hiker Rosa", mult: 0.95, cards: ["boulderox", "gloomcap", "voltfin"], line: "The mountain taught me patience." },
  { id: "twins", name: "Twins Lio & Lia", mult: 1.05, cards: ["frostkoi", "ashdrake", "grimlet"], line: "Two of us, double the trouble!" },
  { id: "morva", name: "Witch Morva", mult: 1.2, cards: ["gloomcap", "grimlet", "thornlord"], line: "Your monsters smell delicious." },
  { id: "vex", name: "Champion Vex", mult: 1.4, cards: ["stormjaw", "ashdrake", "boulderox"], line: "Nobody fuses like I do." },
];

/** Builds a card from a template. Opponents scale stats with `mult`. */
export function makeCard(t: CardTemplate, mult = 1): Card {
  return {
    id: newId(),
    name: t.name,
    els: [t.el],
    maxHp: Math.round(t.hp * mult),
    atk: Math.round(t.atk * mult),
    spd: t.spd,
    ab: { type: t.ab[0], v: Math.round(t.ab[1] * (mult > 1 ? mult : 1)) },
    look: { ...t.look },
    flavor: t.flavor,
    gen: 0,
    outcome: null,
  };
}
