import type { Card, Opponent } from "../../shared/types.js";
import type { Fighter } from "../../shared/battle/engine.js";
import { newId } from "../../shared/rng.js";
import { fuse } from "../../shared/fusion/roll.js";
import { DECK_MAX, S, byId, save } from "../state/store.js";
import { closeScreen, openScreen } from "../router.js";
import { cardHTML } from "../battle/cards.js";
import { fusionImage, fusionText } from "../api.js";
import { esc } from "../util.js";
import { cry, fusionReveal, sample, sfx } from "../audio/sfx.js";
import { startHelix } from "./helix.js";

export function showLost(opp: Opponent, turns: number) {
  const o = openScreen(`<div class="screen center">
    <div class="big-title" style="color:var(--bad)">${esc(opp.name)} wins</div>
    <p class="hint">The battle took ${turns} turns. Your monsters are healed. Try a different party, practise your timing, or fuse a few cards first.</p>
    <button class="btn primary" type="button" data-close>Back to the world</button>
  </div>`);
  o.onclick = e => { if ((e.target as HTMLElement).closest("[data-close]")) closeScreen(); };
}

/** Offers the cards the opponent fought with, at full health. */
export function showReward(opp: Opponent, turns: number, theirs: Fighter[]) {
  const cards: Card[] = theirs.map(({ hp: _hp, ...c }) => ({ ...c, id: newId() }));
  const o = openScreen(`<div class="screen center">
    <div class="big-title">You beat ${esc(opp.name)}!</div>
    <p class="hint">The battle took ${turns} turn${turns === 1 ? "" : "s"}. Take one of their cards.</p>
    <div class="row">${cards.map(c => cardHTML(c, { tag: "button", attrs: `type="button" data-take="${c.id}"` })).join("")}</div>
  </div>`);
  o.onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-take]");
    if (!t) return;
    const c = cards.find(c => c.id === t.dataset.take)!;
    sfx("select"); cry(c, { delay: .1 });
    showFusionPick(c, null);
  };
}

function showFusionPick(taken: Card, partnerId: string | null) {
  const full = S.deck.length >= DECK_MAX;
  const partner = partnerId ? byId(partnerId) : null;
  const o = openScreen(`<div class="screen center">
    <div class="big-title">Fuse ${esc(taken.name)}?</div>
    <p class="hint">Pick one of your cards to fuse with it. The new monster replaces your card.${full ? " Your deck is full, so you have to fuse." : ""}</p>
    <div class="row">
      ${cardHTML(taken, { badge: "New" })}
      ${partner ? cardHTML(partner) : `<div class="card" style="--el:var(--line);min-height:260px;display:grid;place-items:center;background:var(--panel);color:var(--muted);text-align:center">Pick a card below</div>`}
    </div>
    <div class="row" style="gap:10px">
      <button class="btn primary" type="button" data-dofuse ${partner ? "" : "disabled"}>Fuse them</button>
      <button class="btn" type="button" data-keep ${full ? "disabled" : ""}>Keep it without fusing</button>
    </div>
    <h2 class="section-title">Your deck</h2>
    <div class="deck" style="width:100%">${S.deck.map(c => cardHTML(c, { tag: "button", attrs: `type="button" data-partner="${c.id}"`, selected: partnerId === c.id })).join("")}</div>
  </div>`);
  o.onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!t) return;
    if (t.dataset.partner) { sfx("select"); showFusionPick(taken, t.dataset.partner); }
    else if (t.dataset.dofuse !== undefined && partner) void doFuse(taken, partner);
    else if (t.dataset.keep !== undefined) { S.deck.push(taken); save(); closeScreen(); }
  };
}

async function doFuse(taken: Card, partner: Card) {
  const w = openScreen(`<div class="screen center">
    <div class="big-title">Fusing…</div>
    <div class="fuse-stage fusing">${cardHTML(taken, { cls: "a" })}<span class="plus">+</span>${cardHTML(partner, { cls: "b" })}</div>
    <p class="hint">Fusing the monsters<span class="dots"><b>.</b><b>.</b><b>.</b></span></p>
  </div>`);
  void sample("fusion");
  const helix = startHelix(w.querySelector<HTMLElement>(".fuse-stage")!, taken, partner);
  const res = fuse(taken, partner, S.tuning);
  const [text, img] = await Promise.all([fusionText(taken, partner, res.outcome), fusionImage(res.child), new Promise(r => setTimeout(r, 2000))]);
  await helix.finish();
  const c = { ...res.child, name: text.name, flavor: text.flavor, ...(img ? { art: img.art } : {}) };
  S.stats[res.outcome]++;
  S.deck[S.deck.findIndex(x => x.id === partner.id)] = c;
  const pi = S.party.indexOf(partner.id);
  if (pi >= 0) S.party[pi] = c.id;
  save();
  fusionReveal(res.outcome, c);
  const d = (v: number, base: number) => { const pct = Math.round((v / base - 1) * 100); return `<span class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "+" : ""}${pct}%</span>`; };
  const o = openScreen(`<div class="screen center">
    <div class="flash"></div>
    <div class="outcome ${res.outcome}">${res.outcome === "crit" ? "Critical fusion!" : res.outcome === "botch" ? "Botched fusion…" : "Fusion complete"}</div>
    <div class="reveal" style="width:220px;max-width:100%">${cardHTML(c)}</div>
    <div class="deltas"><span>HP ${c.maxHp} ${d(c.maxHp, res.base.hp)}</span><span>ATK ${c.atk} ${d(c.atk, res.base.atk)}</span><span>SPD ${c.spd} ${d(c.spd, res.base.spd)}</span></div>
    <p class="hint">Change compared with the average of ${esc(taken.name)} and ${esc(partner.name)}. Name source: ${esc(text.source)}. Art: ${img ? `${esc(img.model)}, ${img.seconds} s` : "placeholder"}.</p>
    <button class="btn primary" type="button" data-close>Back to the world</button>
  </div>`);
  o.onclick = e => { if ((e.target as HTMLElement).closest("[data-close]")) closeScreen(); };
}
