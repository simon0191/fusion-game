import type { Side } from "../../shared/types";
import { $, rnd } from "../util";

interface Particle { x: number; y: number; vx: number; vy: number; g?: number; life: number; max: number; size: number; color: string }
let fx: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; parts: Particle[]; running: boolean; w: number; h: number } | null = null;

/** Animation speed multiplier, set from the battle speed buttons. */
export let speed = 1;
export const setSpeed = (s: number) => { speed = s; };
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms / speed));

export function setupFx() {
  const cv = $<HTMLCanvasElement>("#fx");
  if (!cv) { fx = null; return; }
  const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx = { cv, ctx, parts: [], running: false, w: r.width, h: r.height };
}

function slotCenter(side: Side) {
  const arena = $("#arena")!, slot = $(`.slot.${side}`)!;
  const a = arena.getBoundingClientRect(), s = slot.getBoundingClientRect();
  return { x: s.left - a.left + s.width / 2, y: s.top - a.top + s.height * 0.55, w: s.width };
}

function runFx() {
  if (!fx || fx.running) return;
  fx.running = true;
  let last = performance.now();
  const step = (now: number) => {
    if (!fx) return;
    const dt = (Math.min(40, now - last) / 1000) * speed; last = now;
    const c = fx.ctx;
    c.clearRect(0, 0, fx.w, fx.h);
    c.globalCompositeOperation = "lighter";
    fx.parts = fx.parts.filter(p => (p.life -= dt) > 0);
    for (const p of fx.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
      const a = Math.max(0, p.life / p.max);
      c.fillStyle = p.color; c.globalAlpha = a;
      c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, 7); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    if (fx.parts.length) requestAnimationFrame(step);
    else { fx.running = false; c.clearRect(0, 0, fx.w, fx.h); }
  };
  requestAnimationFrame(step);
}

const mon = (side: Side) => $(side === "mine" ? "#monMine" : "#monTheirs");

export async function animAttack(side: Side, to: Side, color: string, selfHit: boolean) {
  const m = mon(side);
  if (!m || !fx) return;
  const dx = side === "mine" ? 1 : -1, dy = side === "mine" ? -1 : 1;
  m.animate([{ transform: "none" }, { transform: `translate(${-10 * dx}px, ${-6 * dy}px)` }, { transform: `translate(${26 * dx}px, ${16 * dy}px)` }, { transform: "none" }], { duration: 420 / speed, easing: "ease-in-out" });
  await sleep(160);
  const A = slotCenter(side), B = slotCenter(to);
  if (selfHit) {
    for (let i = 0; i < 24; i++) fx.parts.push({ x: A.x, y: A.y - 40, vx: rnd(-80, 80), vy: rnd(-40, 60), g: 200, life: 0.6, max: 0.6, size: rnd(3, 6), color: "#ffffff" });
  } else {
    const sp = Math.hypot(B.x - A.x, B.y - A.y) / 0.32, ang0 = Math.atan2(B.y - A.y, B.x - A.x);
    for (let i = 0; i < 46; i++) {
      const ang = ang0 + rnd(-0.08, 0.08), delay = (i / 46) * 0.12;
      fx.parts.push({ x: A.x - Math.cos(ang) * sp * delay, y: A.y - Math.sin(ang) * sp * delay, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.32 + delay, max: 0.32 + delay, size: rnd(4, 9), color: i % 3 ? color : "#ffffff" });
    }
  }
  runFx();
  await sleep(selfHit ? 200 : 330);
  for (let i = 0; i < 30; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(60, 220);
    fx.parts.push({ x: B.x, y: B.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 120, life: rnd(0.3, 0.6), max: 0.6, size: rnd(3, 7), color: i % 2 ? color : "#fff6c8" });
  }
  runFx();
}

export async function hitFx(side: Side) {
  const m = mon(side);
  if (!m) return;
  await m.animate([
    { transform: "none", filter: "none" }, { transform: "translateX(-8px) rotate(-4deg)", filter: "brightness(3)" },
    { transform: "translateX(8px) rotate(4deg)", filter: "brightness(1.5)" }, { transform: "translateX(-5px)", filter: "none" }, { transform: "none" },
  ], { duration: 320 / speed }).finished;
}

export async function koFx(side: Side) {
  const m = mon(side);
  if (!m) return;
  const r = side === "mine" ? -1 : 1;
  await m.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(-10px) rotate(${20 * r}deg)`, opacity: 1 }, { transform: `translateY(40%) rotate(${90 * r}deg)`, opacity: 0 }],
    { duration: 700 / speed, easing: "ease-in", fill: "forwards" }).finished;
}

export function floatText(side: Side, text: string, cls: string) {
  const arena = $("#arena");
  if (!arena) return;
  const c = slotCenter(side);
  const el = document.createElement("div");
  el.className = "dmg " + cls;
  el.textContent = text;
  el.style.left = c.x + rnd(-20, 20) + "px";
  el.style.top = c.y - c.w * 0.45 + "px";
  arena.appendChild(el);
  el.animate([{ transform: "translate(-50%, 0) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -20px) scale(1.15)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%, -70px) scale(1)", opacity: 0 }],
    { duration: 1000 / speed, easing: "ease-out" }).finished.then(() => el.remove());
}

export async function enterFx(side: Side) {
  const m = mon(side);
  if (!m) return;
  const from = side === "mine" ? "translateX(-60%)" : "translateX(60%)";
  await m.animate([{ transform: from, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 400 / speed, easing: "ease-out" }).finished;
}
