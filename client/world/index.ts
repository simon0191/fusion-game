import { MathUtils, PCFShadowMap, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import { OPPONENTS } from "../../shared/data/cards.js";
import type { Opponent } from "../../shared/types.js";
import { S } from "../state/store.js";
import type { WorldHandle } from "../router.js";
import { $, esc } from "../util.js";
import { buildEnv } from "./scene.js";
import { Joystick } from "./joystick.js";
import { BOUNDS, NPC_SPOTS, PLAYER_START } from "./layout.js";
import { PLAYER_OUTFIT, makeTrainer, npcOutfit } from "./trainers.js";
import { sfx } from "../audio/sfx.js";

const WALK_SPEED = 5;
const TALK_RANGE = 2.6;
const BODY_R = 0.45;

interface Npc { opp: Opponent; index: number; trainer: ReturnType<typeof makeTrainer>; label: HTMLElement; x: number; z: number; platform: boolean }

export interface WorldCallbacks { onChallenge(opp: Opponent): void; onOpenDeck(): void }

export function createWorld(container: HTMLElement, cb: WorldCallbacks): WorldHandle {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const renderer = new WebGLRenderer({ antialias: dpr < 2, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.appendChild(renderer.domElement);
  const camera = new PerspectiveCamera(45, 1, 0.1, 160);

  const env = buildEnv();
  const player = makeTrainer(PLAYER_OUTFIT);
  player.group.position.set(PLAYER_START.x, 0, PLAYER_START.z);
  player.group.rotation.y = Math.PI;
  env.scene.add(player.group);

  const labels = $("#labels")!;
  const npcs: Npc[] = OPPONENTS.map((opp, index) => {
    const spot = NPC_SPOTS[opp.id];
    const trainer = makeTrainer(npcOutfit(opp.id, spot.color, !!spot.platform));
    trainer.group.position.set(spot.x, spot.platform ? 0.3 : 0, spot.z);
    trainer.group.rotation.y = Math.atan2(PLAYER_START.x - spot.x, PLAYER_START.z - spot.z);
    env.scene.add(trainer.group);
    const label = document.createElement("div");
    label.className = "npc-label";
    labels.appendChild(label);
    return { opp, index, trainer, label, x: spot.x, z: spot.z, platform: !!spot.platform };
  });
  const obstacles = [...env.obstacles, ...npcs.map(n => ({ x: n.x, z: n.z, r: 0.5 }))];

  /* ---------- Input: thumb stick on touch screens, WASD/arrows on desktop ---------- */
  const stick = new Joystick(renderer.domElement);
  const keys = new Set<string>();
  addEventListener("keydown", e => { if (!paused) keys.add(e.code); });
  addEventListener("keyup", e => keys.delete(e.code));

  /* ---------- Loop ---------- */
  let paused = false, raf = 0, last = performance.now(), near: Npc | null = null, nearKey = "", greeted = "";
  const camOffset = new Vector3();
  const tmp = new Vector3();

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const far = camera.aspect < 1 ? 1.55 : 1;
    camOffset.set(0, 9 * far, 11 * far);
  }
  resize();
  addEventListener("resize", resize);
  camera.position.copy(player.group.position).add(camOffset);

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
    const pos = player.group.position;
    // The camera looks north, so screen right is +x and screen down is +z.
    const len = Math.hypot(mx, mz);
    const moving = len > 0;
    if (moving) {
      const speed = WALK_SPEED * Math.min(1, len);
      pos.x += (mx / len) * speed * dt;
      pos.z += (mz / len) * speed * dt;
      const want = Math.atan2(mx, mz);
      let diff = want - player.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.group.rotation.y += diff * Math.min(1, dt * 12);
    }
    for (const o of obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z, dist = Math.hypot(dx, dz), min = o.r + BODY_R;
      if (dist < min && dist > 1e-4) { pos.x = o.x + (dx / dist) * min; pos.z = o.z + (dz / dist) * min; }
    }
    pos.x = MathUtils.clamp(pos.x, -BOUNDS, BOUNDS);
    pos.z = MathUtils.clamp(pos.z, -BOUNDS, BOUNDS);
    pos.y += (env.heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 15);
    const t = now / 1000;
    if (player.update(dt, moving ? Math.min(1, len) : 0, t) && moving) sfx("step", { vol: Math.min(1, len) });
    for (const n of npcs) n.trainer.update(dt, 0, t + n.index * 1.3);
    env.update(t, pos);

    tmp.copy(pos).add(camOffset);
    camera.position.lerp(tmp, Math.min(1, dt * 5));
    camera.lookAt(pos.x, pos.y + 0.8, pos.z);

    // Nearest challenger in talking range, and the labels above every challenger.
    near = null;
    let best = TALK_RANGE;
    const w = container.clientWidth, h = container.clientHeight;
    for (const n of npcs) {
      const g = n.trainer.group;
      const d = Math.hypot(pos.x - n.x, pos.z - n.z);
      if (d < best) { best = d; near = n; }
      if (d < 5) {
        const want = Math.atan2(pos.x - n.x, pos.z - n.z);
        let diff = want - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * Math.min(1, dt * 6);
      }
      tmp.set(n.x, g.position.y + 2.1, n.z).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      n.label.style.display = visible ? "" : "none";
      if (visible) {
        const half = n.label.offsetWidth / 2 + 4;
        const sx = MathUtils.clamp(((tmp.x + 1) / 2) * w, half, w - half);
        n.label.style.transform = `translate(${sx}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    }
    updateInteract();
    renderer.render(env.scene, camera);
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
    if (!near) { box.hidden = true; box.innerHTML = ""; greeted = ""; return; }
    if (near.opp.id !== greeted) sfx("near");
    greeted = near.opp.id;
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
    debug: () => ({ x: player.group.position.x, z: player.group.position.z, paused }),
    warp(x, z) { player.group.position.set(x, 0, z); camera.position.copy(player.group.position).add(camOffset); },
  };
}

