import { type Group, MathUtils, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import { OPPONENTS } from "../../shared/data/cards.js";
import type { Opponent } from "../../shared/types.js";
import { S } from "../state/store.js";
import type { WorldHandle } from "../router.js";
import { $, esc } from "../util.js";
import { buildScene } from "./scene.js";
import { makeCharacter, makePlatform } from "./actors.js";
import { Joystick } from "./joystick.js";
import { BOUNDS, NPC_SPOTS, PLAYER_START } from "./layout.js";

const WALK_SPEED = 5;
const TALK_RANGE = 2.6;
const BODY_R = 0.45;

interface Npc { opp: Opponent; index: number; group: Group; label: HTMLElement; x: number; z: number; platform: boolean }

export interface WorldCallbacks { onChallenge(opp: Opponent): void; onOpenDeck(): void }

export function createWorld(container: HTMLElement, cb: WorldCallbacks): WorldHandle {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const renderer = new WebGLRenderer({ antialias: dpr < 2, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  container.appendChild(renderer.domElement);
  const camera = new PerspectiveCamera(45, 1, 0.1, 120);

  const { scene, obstacles } = buildScene();
  const player = makeCharacter("#ffcf4a");
  player.position.set(PLAYER_START.x, 0, PLAYER_START.z);
  player.rotation.y = Math.PI;
  scene.add(player);

  const labels = $("#labels")!;
  const npcs: Npc[] = OPPONENTS.map((opp, index) => {
    const spot = NPC_SPOTS[opp.id];
    const group = makeCharacter(spot.color, opp.id === "vex");
    group.position.set(spot.x, spot.platform ? 0.3 : 0, spot.z);
    group.userData.npc = opp.id;
    scene.add(group);
    if (spot.platform) { const p = makePlatform(); p.position.x = spot.x; p.position.z = spot.z; scene.add(p); }
    obstacles.push({ x: spot.x, z: spot.z, r: 0.5 });
    const label = document.createElement("div");
    label.className = "npc-label";
    labels.appendChild(label);
    return { opp, index, group, label, x: spot.x, z: spot.z, platform: !!spot.platform };
  });

  /* ---------- Input: thumb stick on touch screens, WASD/arrows on desktop ---------- */
  const stick = new Joystick(renderer.domElement);
  const keys = new Set<string>();
  addEventListener("keydown", e => { if (!paused) keys.add(e.code); });
  addEventListener("keyup", e => keys.delete(e.code));

  /* ---------- Loop ---------- */
  let paused = false, raf = 0, last = performance.now(), near: Npc | null = null, nearKey = "";
  const camOffset = new Vector3();
  const tmp = new Vector3();

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const far = camera.aspect < 1 ? 1.7 : 1;
    camOffset.set(0, 13 * far, 8 * far);
  }
  resize();
  addEventListener("resize", resize);
  camera.position.copy(player.position).add(camOffset);

  const isLocked = (n: Npc) => !S.tuning.alwaysWin && n.index > 0 && !S.beaten.includes(OPPONENTS[n.index - 1].id);

  function step(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let mx = 0, mz = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    if (!mx && !mz) { mx = stick.value.x; mz = stick.value.y; }
    // The camera looks north, so screen right is +x and screen down is +z.
    const len = Math.hypot(mx, mz);
    const moving = len > 0;
    if (moving) {
      const speed = WALK_SPEED * Math.min(1, len);
      player.position.x += (mx / len) * speed * dt;
      player.position.z += (mz / len) * speed * dt;
      const want = Math.atan2(mx, mz);
      let diff = want - player.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.rotation.y += diff * Math.min(1, dt * 12);
    }
    for (const o of obstacles) {
      const dx = player.position.x - o.x, dz = player.position.z - o.z, dist = Math.hypot(dx, dz), min = o.r + BODY_R;
      if (dist < min && dist > 1e-4) { player.position.x = o.x + (dx / dist) * min; player.position.z = o.z + (dz / dist) * min; }
    }
    player.position.x = MathUtils.clamp(player.position.x, -BOUNDS, BOUNDS);
    player.position.z = MathUtils.clamp(player.position.z, -BOUNDS, BOUNDS);
    const vexSpot = npcs.find(n => n.platform);
    player.position.y = vexSpot && Math.hypot(player.position.x - vexSpot.x, player.position.z - vexSpot.z) < 2.5 ? 0.3 : 0;
    const body = player.getObjectByName("body")!;
    body.position.y = moving ? Math.abs(Math.sin(now / 110)) * 0.12 : 0;

    tmp.copy(player.position).add(camOffset);
    camera.position.lerp(tmp, Math.min(1, dt * 5));
    camera.lookAt(player.position.x, player.position.y + 0.8, player.position.z);

    // Nearest challenger in talking range, and the labels above every challenger.
    near = null;
    let best = TALK_RANGE;
    const w = container.clientWidth, h = container.clientHeight;
    for (const n of npcs) {
      const d = Math.hypot(player.position.x - n.x, player.position.z - n.z);
      if (d < best) { best = d; near = n; }
      if (d < 5) {
        const want = Math.atan2(player.position.x - n.x, player.position.z - n.z);
        let diff = want - n.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.group.rotation.y += diff * Math.min(1, dt * 6);
      }
      tmp.set(n.x, n.group.position.y + 2.1, n.z).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      n.label.style.display = visible ? "" : "none";
      if (visible) {
        const half = n.label.offsetWidth / 2 + 4;
        const sx = MathUtils.clamp(((tmp.x + 1) / 2) * w, half, w - half);
        n.label.style.transform = `translate(${sx}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    }
    updateInteract();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(step);
  }

  function refreshLabels() {
    for (const n of npcs) {
      const beaten = S.beaten.includes(n.opp.id), locked = isLocked(n);
      n.label.className = "npc-label" + (beaten ? " beaten" : locked ? " locked" : "");
      n.label.textContent = n.opp.name + (beaten ? " ✓" : locked ? " (locked)" : "");
    }
    $("#progress")!.textContent = `${S.beaten.length}/${OPPONENTS.length} beaten`;
  }

  function updateInteract() {
    const box = $("#interact")!;
    const partyOk = S.party.length === 3;
    const key = near ? `${near.opp.id}|${isLocked(near)}|${partyOk}|${S.beaten.includes(near.opp.id)}` : "";
    if (key === nearKey) return;
    nearKey = key;
    if (!near) { box.hidden = true; box.innerHTML = ""; return; }
    const n = near, locked = isLocked(n), beaten = S.beaten.includes(n.opp.id);
    const prev = n.index > 0 ? OPPONENTS[n.index - 1].name : "";
    box.innerHTML = `<div class="say"><b>${esc(n.opp.name)}:</b> ${locked ? `Come back after you beat ${esc(prev)}.` : `"${esc(n.opp.line)}"`}</div>
      ${!partyOk ? `<button class="btn" type="button" data-deck>Pick a party of 3 first</button>`
        : `<button class="btn primary" type="button" data-battle ${locked ? "disabled" : ""}>${beaten ? "Rematch" : "Battle"} ${esc(n.opp.name)}</button>`}`;
    box.hidden = false;
    box.onclick = e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("button");
      if (!t) return;
      if (t.dataset.deck !== undefined) cb.onOpenDeck();
      else if (t.dataset.battle !== undefined) cb.onChallenge(n.opp);
    };
  }

  refreshLabels();
  raf = requestAnimationFrame(step);

  return {
    pause() {
      if (paused) return;
      paused = true;
      cancelAnimationFrame(raf);
      keys.clear();
      stick.setVisible(false);
      labels.hidden = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      labels.hidden = false;
      stick.setVisible(true);
      last = performance.now();
      raf = requestAnimationFrame(step);
    },
    refresh() { refreshLabels(); nearKey = "~"; },
    debug: () => ({ x: player.position.x, z: player.position.z, paused }),
  };
}
