import {
  BoxGeometry, BufferAttribute, type BufferGeometry, CanvasTexture, Color, type ColorRepresentation, ConeGeometry, CylinderGeometry,
  DodecahedronGeometry, Euler, IcosahedronGeometry, LatheGeometry, type Material, Matrix4, Mesh, MeshLambertMaterial,
  OctahedronGeometry, Quaternion, RepeatWrapping, SRGBColorSpace, SphereGeometry, Vector2, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Layer = "lit" | "glow";
export type Mats = Record<Layer, Material>;

/** Position, yaw, scale, then optional pitch and roll. Tilts are applied before the yaw. */
export function m4(x = 0, y = 0, z = 0, ry = 0, s: number | [number, number, number] = 1, rx = 0, rz = 0) {
  const sv = typeof s === "number" ? new Vector3(s, s, s) : new Vector3(...s);
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz, "YXZ")), sv);
}
export const at = (base: Matrix4, local: Matrix4) => base.clone().multiply(local);

const crystal = new LatheGeometry([new Vector2(0, -0.1), new Vector2(0.55, 0), new Vector2(0.6, 1.3), new Vector2(0, 2)], 6).toNonIndexed();
crystal.computeVertexNormals();

/** Shared unit primitives. Cylinders and boxes are centred on the origin with height 1. */
export const G = {
  sphere: new SphereGeometry(1, 14, 10),
  blob: new IcosahedronGeometry(1, 1),
  dome: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new CylinderGeometry(1, 1, 1, 10),
  hex: new CylinderGeometry(1, 1, 1, 6),
  taper: new CylinderGeometry(0.65, 1, 1, 9),
  cone: new ConeGeometry(1, 1, 8),
  box: new BoxGeometry(1, 1, 1),
  rock: new DodecahedronGeometry(1, 0),
  octa: new OctahedronGeometry(1, 0),
  crystal,
};

/**
 * Collects primitives tinted per vertex, so hundreds of props bake into one mesh per layer.
 * `shade` darkens or varies the colour by world position (fake ambient occlusion, painterly noise).
 */
export class Kit {
  private parts: Record<Layer, BufferGeometry[]> = { lit: [], glow: [] };
  constructor(private shade?: (p: Vector3, c: Color) => void) {}

  add(geo: BufferGeometry, color: ColorRepresentation, m: Matrix4, layer: Layer = "lit") {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.applyMatrix4(m);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const base = new Color(color), c = new Color(), p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      c.copy(base);
      if (this.shade) this.shade(p.fromBufferAttribute(pos, i), c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new BufferAttribute(col, 3));
    this.parts[layer].push(g);
  }

  bake(mats: Mats, shadows = true): Mesh[] {
    const out: Mesh[] = [];
    for (const layer of ["lit", "glow"] as Layer[]) {
      const list = this.parts[layer];
      if (!list.length) continue;
      const mesh = new Mesh(mergeGeometries(list), mats[layer]);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      out.push(mesh);
      list.forEach(g => g.dispose());
      this.parts[layer] = [];
    }
    return out;
  }
}

/** World position the see-through cutout is centred on: the player. */
export const occluderFocus = { value: new Vector3() };

/**
 * Lit vertex-coloured materials. The glow layer adds its own vertex colour as emission, so crystals keep their facets but read as lit from inside.
 * Both cut a dithered hole through anything standing between the camera and the player, so props never hide the trainer.
 */
export function makeMats(glow: number): Mats {
  const make = (g: number) => {
    const m = new MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = s => {
      s.uniforms.uFocus = occluderFocus;
      s.vertexShader = "varying vec3 vOccWorld;\n" + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvOccWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      s.fragmentShader = "varying vec3 vOccWorld;\nuniform vec3 uFocus;\n" + s.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        vec3 occDir = uFocus - cameraPosition; float occLen = length(occDir); occDir /= occLen;
        vec3 occRel = vOccWorld - cameraPosition; float occT = dot(occRel, occDir);
        float occD = length(occRel - occDir * occT);
        if (occT < occLen - 0.9 && vOccWorld.y > 0.15) {
          float hole = smoothstep(1.5, 0.9, occD);
          float dither = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125);
          if (hole > dither) discard;
        }`);
      if (g > 0) s.fragmentShader = s.fragmentShader.replace("#include <emissivemap_fragment>", `totalEmissiveRadiance = vColor.rgb * ${g.toFixed(2)};`);
    };
    m.customProgramCacheKey = () => `world${g}`;
    return m;
  };
  return { lit: make(0), glow: make(glow) };
}

/** Vertical gradient for scene.background. Stops run from the top of the screen to the bottom. */
export function skyTexture(stops: string[]) {
  const c = document.createElement("canvas");
  c.width = 2; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft round dot, used for halos, motes and fireflies. */
export function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Repeating ripple pattern for the stream; scroll its offset to make it flow. */
export function waterTexture(deep: string, light: string) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = deep; ctx.fillRect(0, 0, 64, 128);
  ctx.strokeStyle = light; ctx.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const x = (i * 37) % 60 + 2, y = (i * 53) % 128, len = 6 + (i % 4) * 5;
    ctx.globalAlpha = 0.35 + (i % 3) * 0.2; ctx.lineWidth = 2 + (i % 2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (i % 2 ? 2 : -2), y + len); ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}
