import type { TimingGrade } from "../../shared/types.js";

/** Ring closes onto the target over this long. The tap window does not change with battle speed. */
const CLOSE_MS = 950;
const PERFECT_MS = 80;
const GOOD_MS = 180;
const LATE_MS = 220;
const LEAD_IN_MS = 300;

/**
 * Shows the timing ring in the arena and resolves with the player's grade.
 * `attack`: a well-timed tap powers up the hit. `defend`: it blocks part of the damage.
 * A tap anywhere on the battle screen counts, except on buttons.
 */
export function timingTap(arena: HTMLElement, mode: "attack" | "defend", isCancelled: () => boolean, onGrade?: (g: TimingGrade) => void): Promise<TimingGrade> {
  return new Promise(resolve => {
    const box = document.createElement("div");
    box.className = `tap ${mode}`;
    box.innerHTML = `<div class="label">${mode === "attack" ? "Tap to power up!" : "Tap to block!"}</div><div class="target"></div><div class="ring"></div>`;
    arena.appendChild(box);
    const ring = box.querySelector<HTMLElement>(".ring")!;
    const surface = arena.closest<HTMLElement>("#overlay") ?? arena;
    const start = performance.now() + LEAD_IN_MS;
    const hitAt = start + CLOSE_MS;
    let done = false;

    const finish = (grade: TimingGrade) => {
      if (done) return;
      done = true;
      surface.removeEventListener("pointerdown", onTap);
      removeEventListener("keydown", onKey);
      ring.remove();
      onGrade?.(grade);
      const g = document.createElement("div");
      g.className = `grade ${grade}`;
      g.textContent = grade === "perfect" ? (mode === "attack" ? "Perfect!" : "Perfect block!") : grade === "good" ? (mode === "attack" ? "Good" : "Blocked some") : "Miss";
      box.appendChild(g);
      setTimeout(() => { box.remove(); resolve(grade); }, 420);
    };
    const onTap = (e: Event) => {
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const now = performance.now();
      if (now < start) return;
      const dt = Math.abs(now - hitAt);
      finish(dt <= PERFECT_MS ? "perfect" : dt <= GOOD_MS ? "good" : "miss");
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") onTap(e); };
    surface.addEventListener("pointerdown", onTap);
    addEventListener("keydown", onKey);

    const step = (now: number) => {
      if (done) return;
      if (isCancelled()) { done = true; box.remove(); surface.removeEventListener("pointerdown", onTap); removeEventListener("keydown", onKey); resolve("miss"); return; }
      const t = Math.max(0, now - start) / CLOSE_MS;
      ring.style.transform = `scale(${Math.max(0.5, 3.2 - 2.2 * t)})`;
      ring.style.opacity = String(Math.min(1, 0.3 + t));
      if (now > hitAt + LATE_MS) return finish("miss");
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
