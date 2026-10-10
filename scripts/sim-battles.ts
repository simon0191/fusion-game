// Headless balance check: npm run sim [-- battlesPerCell]
import { DECK_START, OPPONENTS, TEAM_SIZE, randomMonsters } from "../shared/data/cards.js";
import { SKILL, simulateBattle, type TapSkill } from "../shared/battle/bot.js";
import { fuse } from "../shared/fusion/roll.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";
import type { Card } from "../shared/types.js";

const N = Number(process.argv[2]) || 400;
const T = { ...DEFAULT_TUNING, alwaysWin: false };
const power = (c: Card) => c.maxHp * c.atk;

/** A new player's party: the bot's best 3 of a random 5-card starting deck. */
const starterParty = (rng: () => number) => randomMonsters(DECK_START, rng).sort((x, y) => power(y) - power(x)).slice(0, TEAM_SIZE);

console.log(`\n1) Random starting party, no fusions. ${N} battles per cell. Win % / avg turns.\n`);
console.log("opponent".padEnd(18) + Object.keys(SKILL).map(k => k.padStart(14)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = Object.values(SKILL).map((skill, si) => {
    let wins = 0, turns = 0;
    for (let i = 0; i < N; i++) {
      const rng = mulberry32(oi * 1e6 + si * 1e4 + i);
      const b = simulateBattle(starterParty(rng), opp, T, skill, rng);
      if (b.result === "win") wins++;
      turns += b.turn;
    }
    return `${Math.round((wins / N) * 100)}% / ${(turns / N).toFixed(1)}`.padStart(14);
  });
  console.log(opp.name.padEnd(18) + cells.join(""));
}

/** Plays the ladder in order: after each win, take the strongest enemy card and fuse it into the weakest party member. */
function campaign(skill: TapSkill, seed: number) {
  const rng = mulberry32(seed);
  let party = starterParty(rng);
  let losses = 0;
  const lossesAt: number[] = OPPONENTS.map(() => 0);
  for (const [oi, opp] of OPPONENTS.entries()) {
    let theirs: Card[];
    for (;;) {
      const b = simulateBattle(party, opp, T, skill, rng);
      theirs = b.theirs;
      if (b.result === "win") break;
      losses++; lossesAt[oi]++;
      if (losses > 40) return { done: false, losses, lossesAt, party };
    }
    const taken = [...theirs].sort((x, y) => power(y) - power(x))[0];
    const weakest = [...party].sort((x, y) => power(x) - power(y))[0];
    party = party.map(c => (c === weakest ? fuse(taken, c, T, rng).child : c));
  }
  return { done: true, losses, lossesAt, party };
}

console.log(`\n2) Full ladder with a fusion after each win. ${N} runs per skill level.\n`);
for (const [name, skill] of Object.entries(SKILL)) {
  const runs = Array.from({ length: N }, (_, i) => campaign(skill, 9e6 + i));
  const done = runs.filter(r => r.done).length;
  const avgLoss = runs.reduce((s, r) => s + r.losses, 0) / N;
  const perOpp = OPPONENTS.map((o, i) => `${o.name.split(" ")[0]} ${(runs.reduce((s, r) => s + r.lossesAt[i], 0) / N).toFixed(2)}`).join(", ");
  const flawless = runs.filter(r => r.losses === 0).length;
  console.log(`${name.padEnd(8)} finished ${Math.round((done / N) * 100)}%, avg losses ${avgLoss.toFixed(2)}, no-loss runs ${Math.round((flawless / N) * 100)}%`);
  console.log(`         avg losses per opponent: ${perOpp}`);
}
console.log("");
