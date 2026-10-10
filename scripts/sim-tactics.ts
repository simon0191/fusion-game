// Headless balance check for the Tactics prototype: npx tsx scripts/sim-tactics.ts [battlesPerCell]
import { OPPONENTS, STARTERS, makeCard } from "../shared/data/cards.js";
import { SKILL } from "../shared/battle/bot.js";
import { simulateTactics } from "../shared/battle/protos/tactics.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const N = Number(process.argv[2]) || 400;
const T = { ...DEFAULT_TUNING, alwaysWin: false };

console.log(`\nTactics. Starter party (Emberpup, Tidalnewt, Mossback), no fusions. ${N} battles per cell. Win % / avg turns.\n`);
console.log("opponent".padEnd(18) + Object.keys(SKILL).map(k => k.padStart(14)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = Object.values(SKILL).map((skill, si) => {
    let wins = 0, turns = 0;
    for (let i = 0; i < N; i++) {
      const b = simulateTactics(STARTERS.slice(0, 3).map(t => makeCard(t)), opp, T, skill, mulberry32(oi * 1e6 + si * 1e4 + i));
      if (b.result === "win") wins++;
      turns += b.turn;
    }
    return `${Math.round((wins / N) * 100)}% / ${(turns / N).toFixed(1)}`.padStart(14);
  });
  console.log(opp.name.padEnd(18) + cells.join(""));
}
console.log("");
