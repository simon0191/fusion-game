import type { Card, Element, Look } from "../../shared/types.js";
import { ELEMENTS } from "../../shared/data/elements.js";
import { ABILITIES } from "../../shared/data/abilities.js";
import type { Fighter } from "../../shared/battle/engine.js";
import { esc } from "../util.js";

let svgUid = 1;

/** Placeholder monster drawing until generated art arrives. */
export function monsterSVG(g: Look) {
  const id = "m" + svgUid++;
  const c1 = `hsl(${g.h1} 72% 58%)`, c2 = `hsl(${g.h2} 62% 40%)`, belly = `hsl(${g.h1} 85% 84%)`, horn = `hsl(${g.h2} 30% 88%)`;
  const top = [40, 26, 34, 54][g.body];
  let body: string;
  if (g.body === 0) body = `<ellipse cx="60" cy="72" rx="34" ry="32"/>`;
  else if (g.body === 1) body = `<path d="M34 104 Q28 40 60 26 Q92 40 86 104 Z"/>`;
  else if (g.body === 2) {
    const pts: string[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 29 : 38;
      pts.push(`${(60 + Math.cos(a) * r).toFixed(1)},${(72 + Math.sin(a) * r * 0.95).toFixed(1)}`);
    }
    body = `<polygon points="${pts.join(" ")}" stroke="${c1}" stroke-width="4" stroke-linejoin="round"/>`;
  } else body = `<path d="M18 104 Q16 60 60 54 Q104 60 102 104 Z"/>`;
  const ey = top + 20;
  const xs = g.eyes === 1 ? [60] : g.eyes === 2 ? [49, 71] : [44, 60, 76];
  const eyes = xs.map((x, i) => {
    const r = g.wonky ? (i % 2 ? g.eyeSize * 1.35 : g.eyeSize * 0.7) : g.eyeSize;
    return `<circle cx="${x}" cy="${ey}" r="${r}" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="${x + (g.wonky && i % 2 ? -2 : 1)}" cy="${ey + 1}" r="${r * 0.45}" fill="#1a1a1a"/><circle cx="${x - r * 0.3}" cy="${ey - r * 0.35}" r="${r * 0.18}" fill="#fff"/>`;
  }).join("");
  const my = ey + g.eyeSize + 9;
  const mouth = [
    `<path d="M50 ${my} Q60 ${my + 8} 70 ${my}" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>`,
    `<path d="M48 ${my} L72 ${my}" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/><path d="M52 ${my} L55 ${my + 6} L58 ${my}Z M62 ${my} L65 ${my + 6} L68 ${my}Z" fill="#fff" stroke="#1a1a1a" stroke-width="1"/>`,
    `<ellipse cx="60" cy="${my + 2}" rx="6" ry="5" fill="#3a1414" stroke="#1a1a1a" stroke-width="1.5"/>`,
  ][g.mouth];
  const horns = g.horns === 1
    ? `<path d="M40 ${top + 10} L45 ${top - 14} L53 ${top + 6}Z M80 ${top + 10} L75 ${top - 14} L67 ${top + 6}Z" fill="${horn}" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>`
    : g.horns === 2
    ? `<path d="M50 ${top + 4} L40 ${top - 16} M70 ${top + 4} L80 ${top - 16}" stroke="#1a1a1a" stroke-width="2.5"/><circle cx="40" cy="${top - 17}" r="4.5" fill="${c1}" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="80" cy="${top - 17}" r="4.5" fill="${c1}" stroke="#1a1a1a" stroke-width="1.5"/>`
    : "";
  const tail = g.tail ? `<path d="M88 92 Q112 92 108 64" fill="none" stroke="${c2}" stroke-width="8" stroke-linecap="round"/>` : "";
  const aura = g.aura ? `<circle cx="60" cy="68" r="54" fill="url(#${id}a)"/>` : "";
  const skew = g.wonky ? ` transform="rotate(-6 60 70)"` : "";
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <radialGradient id="${id}a"><stop offset=".5" stop-color="#ffe58a" stop-opacity=".7"/><stop offset="1" stop-color="#ff5fb5" stop-opacity="0"/></radialGradient>
    </defs>
    ${aura}
    <g${skew}>${tail}
      <ellipse cx="44" cy="105" rx="10" ry="5" fill="${c2}"/><ellipse cx="76" cy="105" rx="10" ry="5" fill="${c2}"/>
      ${horns}<g fill="url(#${id})" stroke="#1a1a1a" stroke-width="2">${body}</g>
      <ellipse cx="60" cy="${g.body === 1 ? 84 : 90}" rx="${g.body === 3 ? 26 : 17}" ry="${g.body === 3 ? 9 : 12}" fill="${belly}" opacity=".85"/>
      ${eyes}${mouth}
    </g>
  </svg>`;
}

const chips = (els: Element[]) => `<span class="els">${els.map(e => `<span class="chip" style="--c:${ELEMENTS[e].color}">${e}</span>`).join("")}</span>`;
const elColor = (c: Card) => ELEMENTS[c.els[0]].color;

export function cardHTML(c: Card, { tag = "div", attrs = "", selected = false, badge = "", cls = "" } = {}) {
  const ob = c.outcome === "crit" ? `<span class="badge crit">Critical fusion</span>` : c.outcome === "botch" ? `<span class="badge botch">Botched</span>` : "";
  const ab = ABILITIES[c.ab.type];
  return `<${tag} class="card${selected ? " selected" : ""}${cls ? " " + cls : ""}" style="--el:${elColor(c)}" ${attrs}>
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ob}
    <div class="nm"><h3>${esc(c.name)}</h3>${chips(c.els)}</div>
    <div class="art">${monsterSVG(c.look)}</div>
    <div class="st"><div><b>${c.maxHp}</b><span>HP</span></div><div><b>${c.atk}</b><span>ATK</span></div><div><b>${c.spd}</b><span>SPD</span></div></div>
    <div class="ab"><b>${ab.name}.</b> ${ab.describe(c.ab.v)}</div>
    <div class="fl">${esc(c.flavor)}</div>
    ${c.gen ? `<div class="gen">Fusion generation ${c.gen}</div>` : ""}
  </${tag}>`;
}

export const hpClass = (f: Fighter) => { const p = f.hp / f.maxHp; return p > 0.5 ? "" : p > 0.25 ? "mid" : "low"; };
export const miniStats = (f: Fighter) => `${f.hp}/${f.maxHp} HP · ATK ${f.atk} · ${ABILITIES[f.ab.type].name}`;

/** A monster in battle: a small strip chip for the enemy, a card in your hand for yours. */
export function chipHTML(f: Fighter, side: string, { pickable = false, active = false } = {}) {
  const tag = pickable ? "button" : "div";
  return `<${tag} class="mchip${f.hp <= 0 ? " ko" : ""}${active ? " active" : ""}${pickable ? " pickable" : ""}" style="--el:${elColor(f)}" ${pickable ? `type="button" data-fight="${f.id}" aria-label="Fight with ${esc(f.name)}"` : ""} data-mini="${side}-${f.id}">
    ${monsterSVG(f.look)}
    <span class="mn">${esc(f.name)}</span>
    <span class="ms">${miniStats(f)}</span>
    <span class="hpbar"><span class="${hpClass(f)}" style="width:${(f.hp / f.maxHp) * 100}%"></span></span>
  </${tag}>`;
}
