const RADIUS = 56;
const DEAD_ZONE = 0.15;

/**
 * Floating thumb stick. Touch anywhere on the world and the stick appears under your thumb;
 * drag to steer. When idle it rests, faded, in the bottom-left corner as a hint.
 * `value` is in screen space: x right, y down, length 0 to 1.
 */
export class Joystick {
  value = { x: 0, y: 0 };
  private base: HTMLElement;
  private knob: HTMLElement;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;

  constructor(surface: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "stick";
    this.base.setAttribute("aria-hidden", "true");
    this.knob = document.createElement("div");
    this.knob.className = "stick-knob";
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);
    this.rest();

    surface.addEventListener("pointerdown", this.down);
    addEventListener("pointermove", this.move);
    addEventListener("pointerup", this.up);
    addEventListener("pointercancel", this.up);
  }

  private down = (e: PointerEvent) => {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    const m = RADIUS + 8;
    this.cx = Math.min(Math.max(e.clientX, m), innerWidth - m);
    this.cy = Math.min(Math.max(e.clientY, m), innerHeight - m);
    this.base.classList.add("active");
    this.place();
    this.move(e);
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    let dx = e.clientX - this.cx, dy = e.clientY - this.cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / RADIUS);
    const k = mag < DEAD_ZONE ? 0 : (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / (mag || 1);
    this.value = { x: (dx / RADIUS) * k, y: (dy / RADIUS) * k };
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    this.release();
  };

  /** Drops any active touch, for example when a battle opens mid-drag. */
  release() {
    this.id = null;
    this.value = { x: 0, y: 0 };
    this.knob.style.transform = "";
    this.base.classList.remove("active");
    this.rest();
  }

  setVisible(on: boolean) {
    this.base.hidden = !on;
    if (!on) this.release();
  }

  private rest() {
    this.cx = RADIUS + 28;
    this.cy = innerHeight - RADIUS - 40;
    this.place();
  }

  private place() {
    this.base.style.left = `${this.cx}px`;
    this.base.style.top = `${this.cy}px`;
  }
}
