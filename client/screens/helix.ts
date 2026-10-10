import type { Card } from "../../shared/types.js";
import { ELEMENTS } from "../../shared/data/elements.js";
import { reducedMotion } from "../util.js";

type RGB = [number, number, number];

const N = 26;
const ZIPPED = 1.4;
const COLLAPSE = 0.45;
const WHITE: RGB = [255, 255, 255];

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eio = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const eout = (t: number) => 1 - Math.pow(1 - t, 3);
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Draws the fusion as two DNA strands, one in each parent's element colour, that leave the
 * cards, twist into a double helix and zip shut. The helix keeps spinning until `finish`,
 * which spins it down into a point and resolves when it is gone.
 */
export function startHelix(stage: HTMLElement, a: Card, b: Card) {
  const cv = document.createElement("canvas");
  cv.className = "helix";
  stage.append(cv);
  const box = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const W = box.width, H = box.height;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const from = (sel: string, fallback: number) => {
    const r = stage.querySelector(sel)?.getBoundingClientRect();
    return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, h: r.height } : { x: fallback, y: H / 2, h: 160 };
  };
  const src = [from(".card.a", W * 0.2), from(".card.b", W * 0.8)];
  const cols = [hex(ELEMENTS[a.els[0]].color), hex(ELEMENTS[b.els[0]].color)];
  const mid = mix(cols[0], cols[1], 0.5);
  const cx = W / 2, cy = H / 2, fullSpan = Math.min(W - 40, 420);

  const still = reducedMotion();
  const t0 = performance.now();
  let t = still ? ZIPPED : 0, end = Infinity, done: (() => void) | null = null;

  const draw = () => {
    const c = seg(t, end, end + COLLAPSE);
    const span = fullSpan * (1 - eio(c));
    const R = 38 * (1 - eio(c));
    const spin = still ? 0 : t * 3.2 + Math.pow(c * 3, 2) * 4;
    const pts: { x: number; y: number; z: number; e: number; col: RGB }[][] = [[], []];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), ph = u * Math.PI * 4 + spin;
      for (let s = 0; s < 2; s++) {
        const phs = ph + s * Math.PI, start = 0.12 + (s ? 1 - u : u) * 0.32;
        const e = eout(seg(t, start, start + 0.36));
        const wob = e > 0 ? Math.sin(u * 14 + t * 9 + s * 2) * 10 * (1 - e) : 0;
        pts[s].push({
          x: lerp(src[s].x, cx + (u - 0.5) * span, e),
          y: lerp(src[s].y + (u - 0.5) * src[s].h * 0.5, cy + R * Math.sin(phs), e) + wob,
          z: Math.cos(phs), e,
          col: mix(cols[s], mix(mid, WHITE, 0.4), c),
        });
      }
    }
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), p = pts[0][i], q = pts[1][i];
      const zip = seg(t, 0.58 + u * 0.6, 0.66 + u * 0.6);
      if (zip <= 0 || p.e < 0.98 || q.e < 0.98) continue;
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      ctx.lineWidth = 3;
      for (const [r, col] of [[p, p.col], [q, q.col]] as const) {
        ctx.strokeStyle = rgba(col, 0.45 + 0.25 * zip);
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(lerp(r.x, mx, zip), lerp(r.y, my, zip)); ctx.stroke();
      }
      if (zip > 0.6 && zip < 1) {
        const f = 1 - (zip - 0.6) / 0.4;
        ctx.fillStyle = `rgba(255,255,255,${f})`;
        ctx.beginPath(); ctx.arc(mx, my, 3 + 6 * (1 - f), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const strand of pts) {
      for (let i = 1; i < N; i++) {
        const p = strand[i - 1], q = strand[i];
        if (p.e <= 0 || q.e <= 0) continue;
        const d = (p.z + q.z) / 2;
        ctx.strokeStyle = rgba(q.col, 0.35 + 0.35 * (d + 1) / 2); ctx.lineWidth = 2 + d;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    for (const p of pts[0].concat(pts[1]).filter(p => p.e > 0).sort((p, q) => p.z - q.z)) {
      const depth = (p.z + 1) / 2;
      ctx.fillStyle = rgba(mix(p.col, WHITE, 0.25 * depth), 0.55 + 0.45 * depth);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4 + 1.6 * p.z, 0, Math.PI * 2); ctx.fill();
    }
    if (c > 0) {
      const r = 8 + 30 * c;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255,255,255,${c})`); g.addColorStop(0.4, rgba(mid, 0.7 * c)); g.addColorStop(1, rgba(mid, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  };

  const step = (now: number) => {
    if (!cv.isConnected) { done?.(); return; }
    t = (now - t0) / 1000;
    draw();
    if (t >= end + COLLAPSE) { done?.(); return; }
    requestAnimationFrame(step);
  };
  if (still) draw(); else requestAnimationFrame(step);

  return {
    finish(): Promise<void> {
      if (still || !cv.isConnected) return Promise.resolve();
      end = Math.max(t, ZIPPED);
      // Frames stall in a hidden tab, so a timer guarantees the result screen still opens.
      return new Promise(r => { done = r; setTimeout(r, COLLAPSE * 1000 + 150); });
    },
  };
}
