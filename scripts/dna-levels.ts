/**
 * Off-game check of DNA fusion on the game's own data: real monsters, crossAncestry with DEFAULT_TUNING and the
 * server's generateFusionImage (Gemini). Writes design/dna/<id>.png and design/dna/index.html.
 *   npx tsx scripts/dna-levels.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MONSTERS } from "../shared/data/cards.js";
import { crossAncestry, ancestryLine, type Ancestry } from "../shared/fusion/ancestry.js";
import { DEFAULT_TUNING as T } from "../shared/tuning.js";
import { dnaPrompt, generateFusionImage } from "../server/ai/image.js";
import type { Card } from "../shared/types.js";

try { process.loadEnvFile(".env.local"); } catch { /* demo key */ }
const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "design/dna");
mkdirSync(OUT, { recursive: true });
const byName = Object.fromEntries(Object.values(MONSTERS).map(m => [m.name, m]));
const dataUrl = (name: string) => `data:image/webp;base64,${readFileSync(join(ROOT, "public", byName[name].art)).toString("base64")}`;

type Node = { id: string; label: string; ancestry: Ancestry; els: string[]; level: number; parents: string[] };
const nodes: Record<string, Node> = {};
const base = (name: string): Node => ({ id: name, label: name, ancestry: { [name]: 100 }, els: [byName[name].el], level: 0, parents: [] });
const get = (id: string) => nodes[id] ?? base(id);
function plan(id: string, a: string, b: string) {
  const A = get(a), B = get(b);
  const anc = crossAncestry({ ancestry: A.ancestry, name: A.label } as Card, { ancestry: B.ancestry, name: B.label } as Card, T);
  nodes[id] = { id, label: id, ancestry: anc, els: [...new Set([A.els[0], B.els[0]])], level: Math.max(A.level, B.level) + 1, parents: [a, b] };
}
plan("L1a", "Gryffup", "Cinderhorn");
plan("L1b", "Veilfox", "Puffwing");
plan("L1c", "Quartzgrizz", "Bubblotl");
plan("L2a", "L1a", "Lumenlynx");
plan("L2b", "L1b", "Rimescale");
plan("L3a", "L2a", "L1c");
plan("L3b", "L2b", "L1a");
plan("L2same", "L1a", "Cinderhorn");

const results: Record<string, { seconds: number } | null> = {};
await Promise.all(Object.values(nodes).map(async n => {
  const refs = Object.keys(n.ancestry).map(name => ({ name, image: dataUrl(name) }));
  const r = await generateFusionImage({ ancestry: n.ancestry, els: n.els, refs });
  if (r) writeFileSync(join(OUT, `${n.id}.png`), Buffer.from(r.image.split(",")[1], "base64"));
  results[n.id] = r && { seconds: r.seconds };
  console.log(n.id, ancestryLine(n.ancestry), r ? `${r.seconds} s` : "failed");
}));

const pic = (id: string) => (byName[id] ? `../../public${byName[id].art}` : `${id}.png`);
const rows = Object.values(nodes).map(n => `<section><h3>${n.id} · level ${n.level}: ${n.parents.join(" + ")}</h3>
<div class="row">${n.parents.map(p => `<figure><img src="${pic(p)}"><figcaption>${p}</figcaption></figure>`).join("<b>+</b>")}<b>→</b>
<figure class="out"><img src="${n.id}.png"><figcaption>${ancestryLine(n.ancestry)} · ${results[n.id]?.seconds ?? "–"} s</figcaption></figure></div>
<details><summary>prompt</summary><pre>${dnaPrompt(n.ancestry, n.els).split("\n\n")[0]}</pre></details></section>`).join("");
writeFileSync(join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><title>DNA fusion levels</title>
<style>body{font:14px system-ui;background:#f4f2ee;margin:16px}section{background:#fff;border-radius:10px;padding:10px;margin:10px 0}h3{margin:0 0 6px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}figure{margin:0;width:180px}img{width:180px;height:180px;object-fit:contain;background:#faf6ee;border-radius:8px}
.out img{width:240px;height:240px}.out{width:240px}b{font-size:28px;color:#999}figcaption{font-size:12px;color:#555}pre{white-space:pre-wrap;font-size:12px}</style>
<h1>DNA fusion (scheme C) on the game's monsters</h1><p>Ancestors under ${T.ancestryMinPct}% fade out, at most ${T.ancestryMax} stay. References: the surviving ancestors' base art, largest share first. Model: Gemini Nano Banana 2 Lite.</p>${rows}`);
console.log(join(OUT, "index.html"));
