// Headless balance check for the Rush prototype: npx tsx scripts/sim-rush.ts [battlesPerCell]
import { OPPONENTS, STARTERS, makeCard } from "../shared/data/cards.js";
import { RUSH_SKILL, simulateRush } from "../shared/battle/protos/rush.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const N = Number(process.argv[2]) || 300;
const T = { ...DEFAULT_TUNING, alwaysWin: false };

console.log(`\nRush. Starter party (Emberpup, Tidalnewt, Mossback), no fusions. ${N} battles per cell. Win % / avg seconds / time-outs %.\n`);
console.log("opponent".padEnd(18) + Object.keys(RUSH_SKILL).map(k => k.padStart(20)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = Object.values(RUSH_SKILL).map((skill, si) => {
    let wins = 0, ms = 0, timeouts = 0;
    for (let i = 0; i < N; i++) {
      const s = simulateRush(STARTERS.slice(0, 3).map(t => makeCard(t)), opp, T, skill, mulberry32(oi * 1e6 + si * 1e4 + i));
      if (s.result === "win") wins++;
      if (s.endReason.startsWith("time")) timeouts++;
      ms += s.t;
    }
    return `${Math.round((wins / N) * 100)}% / ${(ms / N / 1000).toFixed(0)}s / ${Math.round((timeouts / N) * 100)}%`.padStart(20);
  });
  console.log(opp.name.padEnd(18) + cells.join(""));
}
console.log("");
