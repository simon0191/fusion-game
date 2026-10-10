import type { Card, CardTemplate, Opponent, Rng } from "../types.js";
import { newId } from "../rng.js";

const BASE: Record<string, Omit<CardTemplate, "art">> = {
  gryffup: { name: "Gryffup", el: "rock", hp: 30, atk: 14, spd: 6, ab: ["double", 0], look: { h1: 28, h2: 20, body: 0, eyes: 2, eyeSize: 7, horns: 0, tail: 1, mouth: 0 }, flavor: "Half pup, half griffin. Both halves want a treat." },
  duskwhisk: { name: "Duskwhisk", el: "shadow", hp: 26, atk: 15, spd: 7, ab: ["drain", 0], look: { h1: 255, h2: 270, body: 1, eyes: 2, eyeSize: 7, horns: 1, tail: 1, mouth: 0 }, flavor: "Its crystal ears ring softly when someone nearby is sad." },
  rimescale: { name: "Rimescale", el: "water", hp: 32, atk: 14, spd: 4, ab: ["thorns", 3], look: { h1: 175, h2: 195, body: 1, eyes: 2, eyeSize: 6, horns: 1, tail: 1, mouth: 1 }, flavor: "Ice grows on its back faster than it can shake it off." },
  lanternip: { name: "Lanternip", el: "leaf", hp: 34, atk: 13, spd: 3, ab: ["burn", 3], look: { h1: 95, h2: 140, body: 3, eyes: 2, eyeSize: 9, horns: 2, tail: 1, mouth: 0 }, flavor: "Its glowing tail lures moths at night. It eats the slow ones." },
  lumenlynx: { name: "Lumenlynx", el: "spark", hp: 22, atk: 16, spd: 9, ab: ["quick", 0], look: { h1: 230, h2: 200, body: 2, eyes: 2, eyeSize: 7, horns: 1, tail: 1, mouth: 0 }, flavor: "Its stripes glow brighter the faster it runs." },
  bubblotl: { name: "Bubblotl", el: "water", hp: 30, atk: 12, spd: 5, ab: ["heal", 5], look: { h1: 10, h2: 350, body: 0, eyes: 2, eyeSize: 6, horns: 2, tail: 1, mouth: 2 }, flavor: "Lose a leg? It grows a new one by lunchtime." },
  veilfox: { name: "Veilfox", el: "shadow", hp: 26, atk: 16, spd: 8, ab: ["crit", 0], look: { h1: 245, h2: 265, body: 1, eyes: 2, eyeSize: 5, horns: 1, tail: 1, mouth: 1 }, flavor: "Nobody has seen its real face. Maybe the mask is the face." },
  quartzgrizz: { name: "Quartzgrizz", el: "rock", hp: 38, atk: 13, spd: 2, ab: ["shield", 4], look: { h1: 280, h2: 260, body: 3, eyes: 2, eyeSize: 5, horns: 1, tail: 1, mouth: 1 }, flavor: "Sleeps all winter inside a cave it grew itself." },
  puffwing: { name: "Puffwing", el: "spark", hp: 26, atk: 14, spd: 7, ab: ["shield", 3], look: { h1: 320, h2: 200, body: 0, eyes: 2, eyeSize: 8, horns: 0, tail: 1, mouth: 0 }, flavor: "Made of cloud and static. Pet it and your hair stands up." },
  cinderhorn: { name: "Cinderhorn", el: "fire", hp: 30, atk: 17, spd: 5, ab: ["burn", 4], look: { h1: 15, h2: 0, body: 3, eyes: 2, eyeSize: 6, horns: 1, tail: 1, mouth: 1 }, flavor: "Snorts smoke rings. The hot ones mean stay back." },
};

/** The ten base monsters. Players and opponents both draw their cards from here. Art lives in public/monsters/<key>.webp. */
export const MONSTERS: Record<string, CardTemplate> = Object.fromEntries(
  Object.entries(BASE).map(([k, t]) => [k, { ...t, art: `/monsters/${k}.webp` }]),
);
export const MONSTER_KEYS = Object.keys(MONSTERS);

export const DECK_START = 5;
export const TEAM_SIZE = 3;

export const OPPONENTS: Opponent[] = [
  { id: "tim", name: "Bug Catcher Tim", mult: 0.8, line: "My bugs are the best bugs!" },
  { id: "rosa", name: "Hiker Rosa", mult: 0.95, line: "The mountain taught me patience." },
  { id: "twins", name: "Twins Lio & Lia", mult: 1.05, line: "Two of us, double the trouble!" },
  { id: "morva", name: "Witch Morva", mult: 1.2, line: "Your monsters smell delicious." },
  { id: "vex", name: "Champion Vex", mult: 1.4, line: "Nobody fuses like I do." },
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
    art: t.art,
    flavor: t.flavor,
    gen: 0,
    outcome: null,
  };
}

/** `n` different base monsters, picked at random. */
export function randomMonsters(n: number, rng: Rng, mult = 1): Card[] {
  const keys = [...MONSTER_KEYS];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys.slice(0, n).map(k => makeCard(MONSTERS[k], mult));
}
