import { $ } from "./util.js";
import { duckMusic, music } from "./audio/music.js";

/** The 3D world sits behind every screen. Opening a screen pauses it; closing resumes it. */
export interface WorldHandle { pause(): void; resume(): void; refresh(): void; debug(): { x: number; z: number; paused: boolean }; warp(x: number, z: number): void }
let world: WorldHandle | null = null;
export const setWorld = (w: WorldHandle) => { world = w; };

export function openScreen(html: string) {
  const o = $("#overlay")!;
  o.className = "overlay";
  o.innerHTML = html;
  o.hidden = false;
  o.scrollTop = 0;
  $("#interact")!.hidden = true;
  world?.pause();
  return o;
}

export function closeScreen() {
  const o = $("#overlay")!;
  o.hidden = true;
  o.innerHTML = "";
  world?.refresh();
  world?.resume();
  duckMusic(false);
  music("world");
}
