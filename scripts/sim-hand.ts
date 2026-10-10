// Headless balance check for the Hand prototype: npx tsx scripts/sim-hand.ts [battlesPerCell]
import { OPPONENTS, STARTERS, makeCard } from "../shared/data/cards.js";
import { HAND_SKILLS, TURN_LIMIT, koCount, simulateHand } from "../shared/battle/protos/hand.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const N = Number(process.argv[2]) || 400;
const T = { ...DEFAULT_TUNING, alwaysWin: false };

console.log(`\nHand: starter party (${STARTERS.slice(0, 3).map(t => t.name).join(", ")}), no fusions. ${N} battles per cell, turn limit ${TURN_LIMIT}.`);
console.log("Win % / avg turns / % decided at the turn limit / avg party KOs.\n");
console.log("opponent".padEnd(18) + HAND_SKILLS.map(k => k.padStart(24)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = HAND_SKILLS.map((skill, si) => {
    let wins = 0, turns = 0, limit = 0, lost = 0;
    for (let i = 0; i < N; i++) {
      const s = simulateHand(STARTERS.slice(0, 3).map(t => makeCard(t)), opp, T, skill, mulberry32(oi * 1e6 + si * 1e4 + i));
      if (s.result === "win") wins++;
      if (s.endReason.startsWith("turn limit")) limit++;
      turns += s.turn;
      lost += koCount(s.mine);
    }
    return `${Math.round((wins / N) * 100)}% / ${(turns / N).toFixed(1)} / ${Math.round((limit / N) * 100)}% / ${(lost / N).toFixed(1)}`.padStart(24);
  });
  console.log(opp.name.padEnd(18) + cells.join(""));
}
console.log("");
