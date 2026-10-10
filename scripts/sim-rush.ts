// Headless balance check for the Rush prototype: npx tsx scripts/sim-rush.ts [battlesPerCell]
import { DECK_START, OPPONENTS, TEAM_SIZE, randomMonsters } from "../shared/data/cards.js";
import { RUSH_SKILL, simulateRush } from "../shared/battle/protos/rush.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const N = Number(process.argv[2]) || 300;
const T = { ...DEFAULT_TUNING, alwaysWin: false };
/** A new player's party: the best 3 of a random 5-card starting deck, as in scripts/sim-battles.ts. */
const starterParty = (rng: () => number) => randomMonsters(DECK_START, rng).sort((x, y) => y.maxHp * y.atk - x.maxHp * x.atk).slice(0, TEAM_SIZE);

console.log(`\nRush. Random starting party, no fusions. ${N} battles per cell. Win % / avg seconds / time-outs %.\n`);
console.log("opponent".padEnd(18) + Object.keys(RUSH_SKILL).map(k => k.padStart(20)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = Object.values(RUSH_SKILL).map((skill, si) => {
    let wins = 0, ms = 0, timeouts = 0;
    for (let i = 0; i < N; i++) {
      const rng = mulberry32(oi * 1e6 + si * 1e4 + i);
      const s = simulateRush(starterParty(rng), opp, T, skill, rng);
      if (s.result === "win") wins++;
      if (s.endReason.startsWith("time")) timeouts++;
      ms += s.t;
    }
    return `${Math.round((wins / N) * 100)}% / ${(ms / N / 1000).toFixed(0)}s / ${Math.round((timeouts / N) * 100)}%`.padStart(20);
  });
  console.log(opp.name.padEnd(18) + cells.join(""));
}
console.log("");
