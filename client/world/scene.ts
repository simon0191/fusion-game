import {
  AmbientLight, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DodecahedronGeometry, Fog,
  HemisphereLight, InstancedMesh, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry, Scene, TubeGeometry, Vector3,
} from "three";
import { mulberry32 } from "../../shared/rng.js";
import { BOUNDS, NPC_SPOTS, PATH, PLAYER_START, distToPath } from "./layout.js";

export interface Obstacle { x: number; z: number; r: number }

/** Builds the static placeholder world: ground, path, trees, rocks. Returns the obstacles the player collides with. */
export function buildScene(): { scene: Scene; ground: Mesh; obstacles: Obstacle[] } {
  const scene = new Scene();
  scene.background = new Color("#9fd3e6");
  scene.fog = new Fog("#9fd3e6", 28, 60);
  scene.add(new HemisphereLight("#ffffff", "#5a7a3a", 1.6));
  scene.add(new AmbientLight("#ffffff", 0.3));
  const sun = new DirectionalLight("#fff4d6", 1.6);
  sun.position.set(8, 20, 6);
  scene.add(sun);

  const ground = new Mesh(new PlaneGeometry(BOUNDS * 2 + 30, BOUNDS * 2 + 30), new MeshLambertMaterial({ color: "#78b85a" }));
  ground.rotation.x = -Math.PI / 2;
  ground.name = "ground";
  scene.add(ground);

  const curve = new CatmullRomCurve3(PATH.map(([x, z]) => new Vector3(x, 0, z)));
  const path = new Mesh(new TubeGeometry(curve, 160, 1.1, 6, false), new MeshLambertMaterial({ color: "#d9c08a" }));
  path.scale.y = 0.02;
  scene.add(path);

  const obstacles: Obstacle[] = [];
  const rng = mulberry32(7);
  const clear = (x: number, z: number, r: number) =>
    distToPath(x, z) > 2.2 + r &&
    Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) > 3 &&
    Object.values(NPC_SPOTS).every(s => Math.hypot(x - s.x, z - s.z) > 3.5) &&
    obstacles.every(o => Math.hypot(x - o.x, z - o.z) > o.r + r + 0.4);

  // Trees: a dense ring at the edge so the world reads as enclosed, plus a few scattered inside.
  const trees: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 400 && trees.length < 120; i++) {
    const edge = i % 3 !== 0;
    const x = edge ? (rng() < 0.5 ? -1 : 1) * (BOUNDS - rng() * 3) : (rng() * 2 - 1) * (BOUNDS - 3);
    const z = edge ? (rng() * 2 - 1) * BOUNDS : (rng() * 2 - 1) * (BOUNDS - 3);
    const [tx, tz] = edge && rng() < 0.5 ? [z, x] : [x, z];
    const s = 0.8 + rng() * 0.6;
    if (!clear(tx, tz, 0.7 * s)) continue;
    trees.push({ x: tx, z: tz, s });
    obstacles.push({ x: tx, z: tz, r: 0.7 * s });
  }
  const trunks = new InstancedMesh(new CylinderGeometry(0.18, 0.25, 1, 6), new MeshLambertMaterial({ color: "#7a5532" }), trees.length);
  const crowns = new InstancedMesh(new ConeGeometry(1.1, 2.4, 7), new MeshLambertMaterial({ color: "#2f7d46" }), trees.length);
  const tmp = new Object3D();
  trees.forEach((t, i) => {
    tmp.position.set(t.x, 0.5 * t.s, t.z); tmp.scale.setScalar(t.s); tmp.rotation.y = rng() * 6; tmp.updateMatrix();
    trunks.setMatrixAt(i, tmp.matrix);
    tmp.position.y = (1 + 1.1) * t.s; tmp.updateMatrix();
    crowns.setMatrixAt(i, tmp.matrix);
  });
  scene.add(trunks, crowns);

  const rockMat = new MeshLambertMaterial({ color: "#9a9a92" });
  for (let i = 0, n = 0; i < 200 && n < 14; i++) {
    const x = (rng() * 2 - 1) * (BOUNDS - 3), z = (rng() * 2 - 1) * (BOUNDS - 3), r = 0.4 + rng() * 0.5;
    if (!clear(x, z, r)) continue;
    const rock = new Mesh(new DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, r * 0.5, z); rock.rotation.set(rng(), rng(), rng());
    scene.add(rock);
    obstacles.push({ x, z, r });
    n++;
  }
  return { scene, ground, obstacles };
}
