import type { Element, FusionOutcome, Rng } from "../types.js";
import { pickOne } from "../rng.js";

interface Parent { name: string; els: Element[] }

/** Rule-based stand-in for the AI-written name and flavor text. */
export function mockFusionText(a: Parent, b: Parent, outcome: FusionOutcome, rng: Rng = Math.random) {
  const A = a.name.replace(/^(Mega |Lil )/, ""), B = b.name.replace(/^(Mega |Lil )/, "");
  let name = A.slice(0, Math.ceil(A.length / 2)) + B.slice(Math.floor(B.length / 2)).toLowerCase();
  if (outcome === "crit") name = "Mega " + name;
  if (outcome === "botch") name = "Lil " + name;
  const els = [...new Set([a.els[0], b.els[0]])];
  const flavor = outcome === "crit" ? `A perfect fusion. It carries the strength of ${A} and ${B}.`
    : outcome === "botch" ? `Something went wrong. It has ${B}'s temper and none of ${A}'s brains.`
    : pickOne(rng, [`Born from ${A} and ${B}. It cannot decide which one it misses more.`, `Half ${A}, half ${B}, all attitude.`, `It hums when ${els.join(" and ")} meet.`]);
  return { name: name.slice(0, 24), flavor };
}
