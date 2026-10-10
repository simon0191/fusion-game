import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DirectionalLight, Fog, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Points, PointsMaterial, Scene, Sprite, SpriteMaterial, Vector3,
} from "three";
import { mulberry32 } from "../../shared/rng.js";
import { G, Kit, type Mats, at, dotTexture, m4, makeMats, occluderFocus, skyTexture, waterTexture } from "./kit.js";
import { BOUNDS, NPC_SPOTS, PATH, PLAYER_START, distToPath } from "./layout.js";
import { arch, bigPlant, bridge, crystals, dais, flowers, mossyRock, mushroom, ruin, tree, tuft } from "./props.js";
import { THEME as T } from "./themes.js";

export interface Obstacle { x: number; z: number; r: number }

export interface Env {
  scene: Scene;
  obstacles: Obstacle[];
  /** Height the player stands at: raised on the champion's dais and on the bridge. */
  heightAt(x: number, z: number): number;
  /** Animate water, motes and floating rocks; keep the sun's shadow box centred on `focus`. */
  update(t: number, focus: Vector3): void;
  dispose(): void;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wave = (x: number, z: number) => Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.19 - x * 0.07);
const wave2 = (x: number, z: number) => Math.sin(x * 0.63 + z * 0.41 + Math.sin(z * 0.5)) * Math.cos(z * 0.57 - x * 0.33);
/** Rounded-square distance from the centre, so the edge follows the square play area. */
const norm = (x: number, z: number) => (x ** 4 + z ** 4) ** 0.25;

const STREAM: [number, number][] = [[-40, 13], [-26, 12], [-14, 10.6], [-7, 12], [-1, 11.1], [6, 12.6], [13, 10.2], [26, 11.6], [40, 11]];
const STREAM_W = 1.7;

export function buildEnv(): Env {
  const rng = mulberry32(11);
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];

  /* ---------- Sky, light, fog ---------- */
  const sky = skyTexture(T.sky);
  scene.background = sky;
  scene.fog = new Fog(T.fog[0], T.fog[1], T.fog[2]);
  scene.add(new HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new DirectionalLight(T.sun[0], T.sun[1]);
  const sunDir = new Vector3(...T.sun[2]).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const mats = makeMats(T.glow);
  const shade = (p: Vector3, c: Color) => c.multiplyScalar((0.66 + 0.34 * smooth(-0.1, 0.9, p.y)) * (1 + 0.07 * wave2(p.x * 2, p.z * 2)));
  const kit = new Kit(shade);
  const dot = dotTexture();
  disposables.push(sky, dot, mats.lit, mats.glow);

  /* ---------- Stream ---------- */
  const streamCurve = new CatmullRomCurve3(STREAM.map(([x, z]) => new Vector3(x, 0, z)));
  const streamPts = streamCurve.getSpacedPoints(260);
  const distToStream = (x: number, z: number) => streamPts.reduce((b, p) => Math.min(b, Math.hypot(x - p.x, z - p.z)), Infinity);

  const crossing = streamPts.reduce((b, p) => (distToPath(p.x, p.z) < distToPath(b.x, b.z) ? p : b), streamPts[0]);
  const bridgeDir = pathTangent(crossing.x, crossing.z);
  const BRIDGE_SPAN = 4.2, BRIDGE_RISE = 0.32;

  /* ---------- Ground ---------- */
  const g = T.ground;
  const cBase = new Color(g.base), cLight = new Color(g.light), cDark = new Color(g.dark), cPath = new Color(g.path), cEdge = new Color(g.edge), cBank = new Color(g.bank), cHill = new Color(g.hill);
  const size = 130, segs = 190;
  const groundGeo = new PlaneGeometry(size, size, segs, segs);
  groundGeo.rotateX(-Math.PI / 2);
  const hillAt = (x: number, z: number) => {
    const rise = smooth(BOUNDS + 1.5, BOUNDS + 15, norm(x, z)) * (z > 0 ? 0.5 : 1);
    return rise * (4 + 3 * wave(x, z)) * smooth(STREAM_W / 2, STREAM_W / 2 + 3, distToStream(x, z));
  };
  {
    const pos = groundGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = hillAt(x, z);
      pos.setY(i, h);
      const n1 = wave2(x, z) * 0.6 + wave(x * 1.7, z * 1.7) * 0.4, n2 = wave2(z * 1.3 + 5, x * 1.3);
      c.copy(cBase).lerp(cLight, smooth(0.25, 0.8, n1)).lerp(cDark, smooth(-0.2, -0.75, n2) * 0.8);
      c.lerp(cHill, smooth(0.5, 4, h) * 0.6);
      const ds = distToStream(x, z);
      c.lerp(cBank, smooth(STREAM_W / 2 + 0.9, STREAM_W / 2 + 0.1, ds));
      const dp = distToPath(x, z) + 0.12 * wave2(x * 3, z * 3);
      c.lerp(cEdge, smooth(1.45, 1.1, dp) * 0.8).lerp(cPath, smooth(1.15, 0.8, dp));
      c.multiplyScalar(1 + 0.05 * wave2(x * 4.1, z * 3.7));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    groundGeo.setAttribute("color", new BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  const ground = new Mesh(groundGeo, mats.lit);
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);
  disposables.push(groundGeo);

  /* ---------- Water ---------- */
  const waterTex = waterTexture(T.water[0], T.water[1]);
  const waterMat = new MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.92 });
  disposables.push(waterTex, waterMat);
  const water = new Mesh(ribbon(streamPts, STREAM_W, 0.05), waterMat);
  water.receiveShadow = false;
  scene.add(water);
  disposables.push(water.geometry);
  updates.push(t => { waterTex.offset.y = -t * 0.35; });

  const obstacles: Obstacle[] = [];
  for (let i = 0; i < streamPts.length; i += 3) {
    const p = streamPts[i];
    if (Math.hypot(p.x - crossing.x, p.z - crossing.z) > 1.6 && Math.abs(p.x) < BOUNDS + 1) obstacles.push({ x: p.x, z: p.z, r: STREAM_W / 2 + 0.05 });
  }
  bridge(kit, m4(crossing.x, 0, crossing.z, -Math.atan2(bridgeDir.z, bridgeDir.x), 1), T.P, BRIDGE_SPAN, BRIDGE_RISE);

  /* ---------- Props ---------- */
  const halos: { x: number; y: number; z: number; s: number; color: string }[] = [];
  const clear = (x: number, z: number, r: number, pathGap = 2.2) =>
    distToPath(x, z) > pathGap + r && distToStream(x, z) > STREAM_W / 2 + r + 0.4 &&
    Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) > 3 &&
    Object.values(NPC_SPOTS).every(s => Math.hypot(x - s.x, z - s.z) > (s.platform ? 4.2 : 3.5)) &&
    obstacles.every(o => Math.hypot(x - o.x, z - o.z) > o.r + r + 0.4);
  const place = (x: number, z: number, s: number, ry = rng() * 6) => m4(x, hillAt(x, z), z, ry, s);

  // Arches over the path, with their two pillars as obstacles.
  let lastArch = -99;
  for (const [x, z, len] of pathSamples(0.5)) {
    if (len - lastArch < 9 || z > 12) continue;
    const tdir = pathTangent(x, z), px = -tdir.z, pz = tdir.x, R = 2.05;
    const posts = [[x + px * R, z + pz * R], [x - px * R, z - pz * R]];
    const ok = posts.every(([a, b]) => Object.values(NPC_SPOTS).every(s => Math.hypot(a - s.x, b - s.z) > (s.platform ? 3.4 : 2.6)) && distToStream(a, b) > 2);
    if (!ok) continue;
    arch(kit, m4(x, 0, z, -Math.atan2(pz, px)), T.P, rng);
    posts.forEach(([a, b]) => obstacles.push({ x: a, z: b, r: 0.55 }));
    lastArch = len;
  }

  // Champion's dais.
  const champ = Object.values(NPC_SPOTS).find(s => s.platform)!;
  dais(kit, m4(champ.x, 0, champ.z), T.P, rng);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    obstacles.push({ x: champ.x + Math.cos(a) * 2.95, z: champ.z + Math.sin(a) * 2.95, r: 0.4 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    halos.push({ x: champ.x + Math.cos(a) * 1.95, y: 0.5, z: champ.z + Math.sin(a) * 1.95, s: 1.1, color: T.P.crystal[0] });
  }

  // Dense ring around the play area so the world reads as enclosed.
  const ringKinds = [tree, mushroom, bigPlant];
  const ringTotal = T.ring.reduce((a, b) => a + b, 0);
  const pickRing = () => { let r = rng() * ringTotal; for (let i = 0; i < 3; i++) { r -= T.ring[i]; if (r < 0) return i; } return 0; };
  const outer = BOUNDS + 16;
  for (let i = 0, n = 0; i < 2600 && n < 260; i++) {
    const x = (rng() * 2 - 1) * outer, z = (rng() * 2 - 1) * outer, d = Math.max(Math.abs(x), Math.abs(z));
    if (d < BOUNDS - 2.5 || norm(x, z) > outer) continue;
    // Keep the south edge open: the camera sits behind the player there and tall props would fill the screen.
    if (z > BOUNDS - 3 && Math.abs(x) < 14) continue;
    const kind = pickRing(), s = (kind === 1 ? 1.3 : 1) * (0.85 + rng() * 0.4) * (1 + Math.max(0, d - BOUNDS) * 0.05);
    const r = (kind === 2 ? 0.8 : 0.7) * s;
    const inside = d < BOUNDS + 1;
    if (!clear(x, z, r, inside ? 2.2 : 1.6)) continue;
    ringKinds[kind](kit, place(x, z, s), T.P, rng);
    if (inside) obstacles.push({ x, z, r });
    else obstacles.push({ x, z, r: r * 0.6 }); // keeps later props from overlapping; unreachable for the player
    n++;
  }

  // Scattered inside the play area.
  const scatter = (count: number, r: number, fn: (x: number, z: number) => void, solid = true, pathGap = 2.2) => {
    for (let i = 0, n = 0; i < count * 30 && n < count; i++) {
      const x = (rng() * 2 - 1) * (BOUNDS - 2.5), z = (rng() * 2 - 1) * (BOUNDS - 2.5);
      if (!clear(x, z, r, pathGap)) continue;
      fn(x, z);
      if (solid) obstacles.push({ x, z, r });
      n++;
    }
  };
  scatter(T.ring[0] + 3, 0.8, (x, z) => tree(kit, place(x, z, 0.9 + rng() * 0.3), T.P, rng));
  scatter(T.ring[1] + 3, 0.6, (x, z) => mushroom(kit, place(x, z, 0.8 + rng() * 0.6), T.P, rng));
  scatter(6, 0.7, (x, z) => ruin(kit, place(x, z, 1), T.P, rng));
  scatter(7, 0.55, (x, z) => { crystals(kit, place(x, z, 0.9 + rng() * 0.5), T.P, rng); halos.push({ x, y: 0.7, z, s: 2.2, color: T.P.crystal[halos.length % T.P.crystal.length] }); });
  scatter(10, 0.5, (x, z) => mossyRock(kit, place(x, z, 1), T.P, rng, 0.45 + rng() * 0.35));
  scatter(T.ring[2] * 4 + 4, 0.6, (x, z) => bigPlant(kit, place(x, z, 0.8 + rng() * 0.6), T.P, rng));
  scatter(55, 0.4, (x, z) => flowers(kit, place(x, z, 1), T.P, rng), false, 1.4);
  scatter(200, 0.15, (x, z) => tuft(kit, place(x, z, 0.8 + rng() * 0.6), T.P, rng), false, 1.15);
  // Stepping stones along the path.
  for (const [x, z] of pathSamples(1.25)) {
    if (rng() < 0.45 || distToStream(x, z) < STREAM_W) continue;
    const o = (rng() - 0.5) * 1.2, t = pathTangent(x, z);
    kit.add(G.cyl, T.P.stone[rng() < 0.5 ? 0 : 1], m4(x - t.z * o, 0.02, z + t.x * o, rng() * 3, [0.28 + rng() * 0.15, 0.06, 0.24 + rng() * 0.12]));
  }
  // Reeds and rocks on the stream banks.
  for (let i = 0; i < streamPts.length; i += 4) {
    const p = streamPts[i];
    if (Math.abs(p.x - crossing.x) < 2.6 || rng() < 0.4) continue;
    const side = rng() < 0.5 ? -1 : 1, off = STREAM_W / 2 + 0.25 + rng() * 0.3;
    if (rng() < 0.5) mossyRock(kit, m4(p.x, 0, p.z + side * off), T.P, rng, 0.2 + rng() * 0.2);
    else tuft(kit, m4(p.x, 0, p.z + side * off, 0, 1.3), T.P, rng);
  }

  // Landmarks past the north edge, seen ahead of the player on the way to the champion.
  {
    const north: [number, number][] = [[-9, -27], [8, -30], [-20, -33], [19, -26], [0, -40]];
    north.forEach(([x, z], i) => {
      if (i % 2 === 0) arch(kit, m4(x, hillAt(x, z) - 0.3, z, (rng() - 0.5) * 0.8, 2.4), T.P, rng);
      else crystals(kit, m4(x, hillAt(x, z), z, rng() * 6, 3.4), T.P, rng);
      if (i % 2 === 1) halos.push({ x, y: hillAt(x, z) + 2.5, z, s: 7, color: T.P.crystal[i % 3] });
    });
    for (let i = 0; i < 14; i++) {
      const x = (rng() * 2 - 1) * 36, z = -24 - rng() * 22;
      mushroom(kit, m4(x, hillAt(x, z), z, rng() * 6, 2.2 + rng() * 1.6), T.P, rng);
    }
  }

  for (const mesh of kit.bake(mats)) { scene.add(mesh); disposables.push(mesh.geometry); }

  /* ---------- Floating islands ---------- */
  const floaters: { obj: Object3D; y: number; ph: number; spin: number }[] = [];
  const isleSpots: [number, number, number, number][] = [[-16, 9, -34, 3.2], [14, 12, -40, 4], [-30, 14, -24, 2.6], [30, 8, -22, 2.4], [2, 16, -52, 5]];
  for (const [x, y, z, s] of isleSpots) {
    const isle = floatingIsland(mats, rng, s);
    isle.position.set(x, y, z);
    scene.add(isle);
    isle.traverse(o => { if (o instanceof Mesh) disposables.push(o.geometry); });
    floaters.push({ obj: isle, y, ph: rng() * 6, spin: (rng() - 0.5) * 0.04 });
  }
  updates.push(t => {
    for (const f of floaters) {
      f.obj.position.y = f.y + Math.sin(t * 0.45 + f.ph) * 0.35;
      f.obj.rotation.y += f.spin * 0.016;
    }
  });

  /* ---------- Glow halos and drifting motes ---------- */
  const haloSprites = halos.map(h => {
    const s = new Sprite(new SpriteMaterial({ map: dot, color: h.color, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: T.halo }));
    s.position.set(h.x, h.y, h.z); s.scale.setScalar(h.s);
    scene.add(s);
    disposables.push(s.material);
    return s;
  });
  updates.push(t => haloSprites.forEach((s, i) => { (s.material as SpriteMaterial).opacity = T.halo * (0.75 + 0.25 * Math.sin(t * 1.6 + i * 1.7)); }));

  if (T.motes) {
    const { color, count, size: ms, blink } = T.motes;
    const base = new Float32Array(count * 3), pos = new Float32Array(count * 3), col = new Float32Array(count * 3), ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (rng() * 2 - 1) * (BOUNDS + 4); base[i * 3 + 1] = 0.3 + rng() * 3.5; base[i * 3 + 2] = (rng() * 2 - 1) * (BOUNDS + 4);
      ph[i] = rng() * 100;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("color", new BufferAttribute(col, 3));
    const mat = new PointsMaterial({ map: dot, size: ms, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    disposables.push(geo, mat);
    const c0 = new Color(color);
    updates.push(t => {
      for (let i = 0; i < count; i++) {
        const p = ph[i];
        pos[i * 3] = base[i * 3] + Math.sin(t * 0.3 + p) * 0.8;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.5 + p * 1.3) * 0.4;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.25 + p) * 0.8;
        const b = blink ? Math.max(0, Math.sin(t * 1.3 + p)) ** 2 : 0.7;
        col[i * 3] = c0.r * b; col[i * 3 + 1] = c0.g * b; col[i * 3 + 2] = c0.b * b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }

  /* ---------- Handle ---------- */
  const bridgeLocal = (x: number, z: number) => {
    const dx = x - crossing.x, dz = z - crossing.z;
    return { along: dx * bridgeDir.x + dz * bridgeDir.z, across: -dx * bridgeDir.z + dz * bridgeDir.x };
  };
  return {
    scene,
    obstacles,
    heightAt(x, z) {
      if (Math.hypot(x - champ.x, z - champ.z) < 2.45) return 0.3;
      const b = bridgeLocal(x, z);
      if (Math.abs(b.along) < BRIDGE_SPAN / 2 && Math.abs(b.across) < 1) return BRIDGE_RISE * Math.cos((b.along / BRIDGE_SPAN) * Math.PI) + 0.1;
      return 0;
    },
    update(t, focus) {
      occluderFocus.value.set(focus.x, focus.y + 0.8, focus.z);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 30);
      for (const u of updates) u(t);
    },
    dispose() { disposables.forEach(d => d.dispose()); },
  };
}

/* ---------- Helpers ---------- */

function pathTangent(x: number, z: number) {
  let best = Infinity, dir = new Vector3(0, 0, -1);
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < best) { best = d; dir = new Vector3(dx, 0, dz).normalize(); }
  }
  return dir;
}

/** Points along the path every `step` metres, with the distance travelled so far. */
function pathSamples(step: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let len = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1], seg = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < seg; d += step) out.push([ax + ((bx - ax) * d) / seg, az + ((bz - az) * d) / seg, len + d]);
    len += seg;
  }
  return out;
}

/** Flat strip following `pts`, with v running along its length in metres so the ripple texture keeps its scale. */
function ribbon(pts: Vector3[], width: number, y: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0;
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l, w = width / 2 * (1 + 0.12 * Math.sin(i * 0.37));
    if (i > 0) v += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) / 2.5;
    pos.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
    uv.push(0, v, 1, v);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A small floating rock with something growing on it. */
function floatingIsland(mats: Mats, rng: () => number, s: number) {
  const k = new Kit((p, c) => c.multiplyScalar(0.62 + 0.38 * smooth(-1.2 * s, 0.4, p.y)));
  const P = T.P;
  k.add(G.blob, T.ground.base, m4(0, -0.05 * s, 0, rng() * 6, [s, 0.28 * s, s]));
  k.add(G.cyl, P.trunk, m4(0, -0.3 * s, 0, 0, [0.96 * s, 0.35 * s, 0.96 * s]));
  k.add(G.cone, P.stone[1], m4(0, -1.4 * s, 0, rng() * 6, [0.95 * s, 2.2 * s, 0.95 * s], Math.PI));
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6;
    k.add(G.cone, P.stone[i % 2], m4(Math.cos(a) * 0.45 * s, -0.9 * s, Math.sin(a) * 0.45 * s, a, [0.45 * s, (1.1 + rng()) * s, 0.45 * s], Math.PI));
  }
  for (let i = 0; i < 5; i++) {
    const a = rng() * 6, len = (0.4 + rng() * 0.8) * s;
    k.add(G.cyl, P.vine, m4(Math.cos(a) * 0.9 * s, -0.35 * s - len / 2, Math.sin(a) * 0.9 * s, 0, [0.04 * s, len, 0.04 * s]));
  }
  const top = m4(0, 0.15 * s, 0, rng() * 6, s * 0.55);
  const kind = Math.floor(rng() * 4);
  if (kind === 0) tree(k, top, P, rng);
  else if (kind === 1) mushroom(k, top, P, rng);
  else if (kind === 2) ruin(k, top, P, rng);
  else crystals(k, at(top, m4(0, 0, 0, 0, 1.6)), P, rng);
  if (rng() < 0.5) mossyRock(k, m4(0.5 * s, 0.1 * s, -0.3 * s), P, rng, 0.25 * s);
  const g = new Group();
  for (const mesh of k.bake(mats, false)) { mesh.receiveShadow = false; g.add(mesh); }
  return g;
}

