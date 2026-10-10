// Headless balance check for the Hand prototype: npx tsx scripts/sim-hand.ts [battlesPerCell]
import { DECK_START, OPPONENTS, TEAM_SIZE, randomMonsters } from "../shared/data/cards.js";
import { HAND_SKILLS, TURN_LIMIT, koCount, simulateHand } from "../shared/battle/protos/hand.js";
import { DEFAULT_TUNING } from "../shared/tuning.js";
import { mulberry32 } from "../shared/rng.js";

const N = Number(process.argv[2]) || 400;
const T = { ...DEFAULT_TUNING, alwaysWin: false };
/** A new player's party: the best 3 of a random 5-card starting deck, as in scripts/sim-battles.ts. */
const starterParty = (rng: () => number) => randomMonsters(DECK_START, rng).sort((x, y) => y.maxHp * y.atk - x.maxHp * x.atk).slice(0, TEAM_SIZE);

console.log(`\nHand: random starting party, no fusions. ${N} battles per cell, turn limit ${TURN_LIMIT}.`);
console.log("Win % / avg turns / % decided at the turn limit / avg party KOs.\n");
console.log("opponent".padEnd(18) + HAND_SKILLS.map(k => k.padStart(24)).join(""));
for (const [oi, opp] of OPPONENTS.entries()) {
  const cells = HAND_SKILLS.map((skill, si) => {
    let wins = 0, turns = 0, limit = 0, lost = 0;
    for (let i = 0; i < N; i++) {
      const rng = mulberry32(oi * 1e6 + si * 1e4 + i);
      const s = simulateHand(starterParty(rng), opp, T, skill, rng);
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
