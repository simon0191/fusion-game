import { z } from "zod";
import type { Element, FusionOutcome } from "../types";

const ELEMENT_IDS = ["fire", "water", "leaf", "rock", "spark", "shadow"] as const satisfies readonly Element[];
const OUTCOMES = ["crit", "normal", "botch"] as const satisfies readonly FusionOutcome[];

const parent = z.object({
  name: z.string().min(1).max(40),
  els: z.array(z.enum(ELEMENT_IDS)).min(1).max(2),
  flavor: z.string().max(200),
});

/** What the client sends to /api/fuse. */
export const FuseRequest = z.object({ a: parent, b: parent, outcome: z.enum(OUTCOMES) });
export type FuseRequest = z.infer<typeof FuseRequest>;

/** What the text model (or its mock) must return. Anything else is rejected. */
export const FusionText = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(2).max(24)),
  flavor: z.string().transform(cleanText).pipe(z.string().min(1).max(140)),
});
export type FusionText = z.infer<typeof FusionText>;

function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
