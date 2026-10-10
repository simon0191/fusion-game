import {
  type BufferGeometry, CapsuleGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Object3D, TorusGeometry,
} from "three";
import { G } from "./kit.js";

export interface Outfit { main: string; accent: string; pack: string; skin: string; hair: string; pants: string; champion?: boolean }

export interface Trainer {
  group: Group;
  /** `speed` is 0 when standing still and 1 at full walking speed. */
  update(dt: number, speed: number, t: number): void;
  dispose(): void;
}

export const PLAYER_OUTFIT: Outfit = { main: "#ffcf4a", accent: "#e8513f", pack: "#3f8fd8", skin: "#f6d2b0", hair: "#5a3a26", pants: "#2f4a6a" };

const SKINS = ["#f6d2b0", "#e6b48c", "#c98f62", "#9c6a45", "#f3c9a6"];
const HAIRS = ["#2a1e1a", "#6a3e22", "#e0b050", "#b04a2a", "#3a3a4a"];
/** Deterministic outfit for a challenger, built around their colour. */
export function npcOutfit(id: string, color: string, champion: boolean): Outfit {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    main: color, accent: champion ? "#ffd34d" : ["#fff4e0", "#2f2f3a", "#ffd34d", "#7fd8ff"][h % 4],
    pack: ["#8a5a3b", "#4a6a8a", "#6a8a4a", "#8a4a6a"][(h >> 3) % 4], skin: SKINS[(h >> 5) % SKINS.length], hair: HAIRS[(h >> 7) % HAIRS.length],
    pants: champion ? "#2a2238" : ["#3a3a4a", "#4a3a2a", "#2f4a6a"][(h >> 9) % 3], champion,
  };
}

/* ---------- Building blocks ---------- */

const capsule = new CapsuleGeometry(1, 1, 4, 10);
const torus = new TorusGeometry(1, 0.35, 8, 18);
const disc = new CircleGeometry(1, 20);

class Builder {
  private mats = new Map<string, MeshLambertMaterial>();
  private extra: { dispose(): void }[] = [];
  mat(color: string) {
    let m = this.mats.get(color);
    if (!m) { m = new MeshLambertMaterial({ color }); this.mats.set(color, m); }
    return m;
  }
  mesh(parent: Object3D, geo: BufferGeometry, color: string, x: number, y: number, z: number, s: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
    const m = new Mesh(geo, this.mat(color));
    m.position.set(x, y, z); m.scale.set(...s); m.rotation.set(...r);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  glow(parent: Object3D, geo: BufferGeometry, color: string, x: number, y: number, z: number, s: [number, number, number]) {
    const mat = new MeshBasicMaterial({ color });
    this.extra.push(mat);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(...s);
    parent.add(m);
    return m;
  }
  pivot(parent: Object3D, x: number, y: number, z: number) {
    const g = new Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  dispose() { this.mats.forEach(m => m.dispose()); this.extra.forEach(m => m.dispose()); }
}

/** Two eyes with highlights and pink cheeks on the +z face of a head of radius `r`. Returns the eyes, for blinking. */
function face(b: Builder, head: Object3D, r: number, skin: string, spacing = 0.36) {
  const eyes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = b.mesh(head, G.sphere, "#1d1a22", side * r * spacing, r * 0.05, r * 0.9, [r * 0.13, r * 0.19, r * 0.09]);
    b.mesh(eye, G.sphere, "#ffffff", 0.35, 0.4, 0.6, [0.32, 0.28, 0.3]).castShadow = false;
    eyes.push(eye);
    b.mesh(head, disc, "#ff9a9a", side * r * 0.6, -r * 0.22, r * 0.79, [r * 0.14, r * 0.09, 1], [0, side * 0.6, 0]).castShadow = false;
  }
  b.mesh(head, G.sphere, skin, 0, -r * 0.12, r * 0.97, [r * 0.07, r * 0.06, r * 0.05]);
  return eyes;
}

interface Rig {
  body: Group; legs: [Group, Group]; arms: [Group, Group]; head: Group; pack: Group; eyes: Mesh[];
  /** Extra per-frame motion for style-specific parts (scarf, lantern, sprout, flag). */
  extra?: (phase: number, speed: number, t: number) => void;
  stride: number; swing: number; bob: number; waddle?: boolean;
}

function animate(rig: Rig): Trainer["update"] {
  let phase = 0, eased = 0, blinkAt = 2 + Math.random() * 3;
  return (dt, speed, t) => {
    eased += (speed - eased) * Math.min(1, dt * 10);
    const s = eased;
    phase += dt * rig.stride * Math.max(0.35, s) * (s > 0.02 ? 1 : 0);
    const sw = Math.sin(phase) * rig.swing * s;
    rig.legs[0].rotation.x = sw; rig.legs[1].rotation.x = -sw;
    rig.arms[0].rotation.x = -sw * 0.9; rig.arms[1].rotation.x = sw * 0.9;
    rig.arms[0].rotation.z = 0.12 + (1 - s) * 0.05 * Math.sin(t * 2); rig.arms[1].rotation.z = -rig.arms[0].rotation.z;
    const breathe = Math.sin(t * 2.2) * 0.015 * (1 - s);
    rig.body.position.y = Math.abs(Math.sin(phase)) * rig.bob * s;
    rig.body.rotation.x = 0.1 * s;
    rig.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    if (rig.waddle) {
      rig.body.rotation.z = Math.sin(phase) * 0.14 * s;
      rig.body.scale.y *= 1 - 0.07 * Math.abs(Math.cos(phase)) * s;
    }
    rig.head.rotation.y = Math.sin(t * 0.6) * 0.3 * (1 - s);
    rig.head.rotation.z = Math.sin(phase) * 0.05 * s;
    rig.pack.rotation.x = -0.05 * s + Math.sin(phase * 2 + 0.8) * 0.07 * s;
    rig.pack.position.y = rig.pack.userData.y + Math.sin(phase * 2 + 0.5) * 0.015 * s;
    blinkAt -= dt;
    const closed = blinkAt < 0.12;
    for (const e of rig.eyes) e.scale.y = closed ? e.userData.sy * 0.15 : e.userData.sy;
    if (blinkAt < 0) blinkAt = 2 + Math.random() * 3.5;
    rig.extra?.(phase, s, t);
  };
}

function finish(b: Builder, root: Group, rig: Rig): Trainer {
  for (const e of rig.eyes) e.userData.sy = e.scale.y;
  rig.pack.userData.y = rig.pack.position.y;
  const group = new Group();
  const shadow = new Mesh(disc, new MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(0.48);
  group.add(shadow, root);
  root.name = "body";
  const update = animate(rig);
  return { group, update, dispose() { b.dispose(); (shadow.material as MeshBasicMaterial).dispose(); } };
}

/* ---------- Sprout: round hooded body, leaf sprout on the hood, oversized pack, waddle walk. ---------- */

export function makeTrainer(o: Outfit): Trainer {
  const b = new Builder(), root = new Group(), body = b.pivot(root, 0, 0, 0);
  const legs = [-1, 1].map(side => {
    const leg = b.pivot(body, side * 0.13, 0.24, 0);
    b.mesh(leg, capsule, o.pants, 0, -0.08, 0, [0.075, 0.06, 0.075]);
    b.mesh(leg, G.sphere, o.accent, 0, -0.18, 0.05, [0.11, 0.07, 0.15]);
    return leg;
  }) as [Group, Group];
  b.mesh(body, G.sphere, o.main, 0, 0.55, 0, [0.34, 0.36, 0.31]);
  b.mesh(body, G.sphere, "#fff4e0", 0, 0.5, 0.17, [0.2, 0.22, 0.16]);
  const arms = [-1, 1].map(side => {
    const arm = b.pivot(body, side * 0.3, 0.68, 0);
    b.mesh(arm, capsule, o.main, side * 0.03, -0.1, 0, [0.07, 0.08, 0.07]);
    b.mesh(arm, G.sphere, o.skin, side * 0.03, -0.22, 0, [0.065, 0.065, 0.065]);
    return arm;
  }) as [Group, Group];
  const head = b.pivot(body, 0, 1.0, 0);
  b.mesh(head, G.sphere, o.main, 0, 0.03, -0.1, [0.37, 0.36, 0.34]);
  b.mesh(head, G.sphere, o.skin, 0, -0.02, 0.04, [0.28, 0.26, 0.27]);
  b.mesh(head, G.blob, o.hair, 0, 0.16, 0.13, [0.2, 0.07, 0.12], [0.5, 0, 0]);
  b.mesh(head, torus, o.main, 0, 0, 0.1, [0.29, 0.28, 0.3]);
  const leaf = b.pivot(head, 0, 0.34, -0.04);
  b.mesh(leaf, G.cyl, "#4f9a3c", 0, 0.08, 0, [0.02, 0.18, 0.02]);
  for (const side of [-1, 1]) b.mesh(leaf, G.sphere, "#6cc35a", side * 0.09, 0.18, 0, [0.1, 0.025, 0.05], [0, 0, side * -0.4]);
  if (o.champion) b.mesh(head, G.cone, "#ffd34d", 0, 0.38, 0.12, [0.07, 0.12, 0.07]);
  const eyes = face(b, b.pivot(head, 0, -0.03, 0.06), 0.26, o.skin, 0.38);
  const pack = b.pivot(body, 0, 0.72, -0.3);
  b.mesh(pack, G.blob, o.pack, 0, 0, -0.14, [0.36, 0.42, 0.26]);
  b.mesh(pack, G.dome, o.accent, 0, 0.26, -0.14, [0.3, 0.16, 0.22]);
  b.mesh(pack, G.box, o.accent, 0, -0.08, -0.38, [0.26, 0.2, 0.06]);
  for (const side of [-1, 1]) b.mesh(pack, G.blob, o.pack, side * 0.34, -0.12, -0.14, [0.09, 0.14, 0.12]);
  b.mesh(pack, G.cyl, "#e8dcc0", 0, -0.36, -0.14, [0.1, 0.62, 0.1], [0, 0, Math.PI / 2]);
  const pole = b.pivot(pack, 0.22, 0.25, -0.2);
  b.mesh(pole, G.cyl, "#7a4a2a", 0, 0.3, 0, [0.015, 0.6, 0.015]);
  const flag = b.pivot(pole, 0, 0.55, 0);
  b.mesh(flag, G.box, o.accent, 0, 0, -0.1, [0.01, 0.1, 0.18]);
  return finish(b, root, {
    body, legs, arms, head, pack, eyes, stride: 13, swing: 0.9, bob: 0.06, waddle: true,
    extra(phase, s, t) {
      leaf.rotation.z = Math.sin(phase) * 0.3 * s + Math.sin(t * 1.8) * 0.08;
      leaf.rotation.x = Math.sin(phase * 2) * 0.2 * s;
      pole.rotation.z = Math.sin(phase + 0.6) * 0.15 * s;
      flag.rotation.y = Math.sin(t * 6) * 0.25 + 0.3 * s;
    },
  });
}
