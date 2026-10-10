import { CapsuleGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry } from "three";

/** Placeholder character: capsule body, two eyes facing +z, a soft shadow. */
export function makeCharacter(color: string, hat = false): Group {
  const g = new Group();
  const shadow = new Mesh(new CircleGeometry(0.5, 20), new MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  g.add(shadow);
  const body = new Group();
  body.name = "body";
  const torso = new Mesh(new CapsuleGeometry(0.38, 0.7, 6, 14), new MeshLambertMaterial({ color }));
  torso.position.y = 0.75;
  body.add(torso);
  const eyeMat = new MeshBasicMaterial({ color: "#1a1a1a" });
  for (const x of [-0.13, 0.13]) {
    const eye = new Mesh(new SphereGeometry(0.06, 8, 8), eyeMat);
    eye.position.set(x, 1.05, 0.34);
    body.add(eye);
  }
  if (hat) {
    const brim = new Mesh(new CylinderGeometry(0.55, 0.55, 0.05, 20), new MeshLambertMaterial({ color: "#2a2a2a" }));
    brim.position.y = 1.35;
    const top = new Mesh(new ConeGeometry(0.32, 0.6, 16), new MeshLambertMaterial({ color: "#2a2a2a" }));
    top.position.y = 1.65;
    body.add(brim, top);
  }
  g.add(body);
  return g;
}

export function makePlatform(): Mesh {
  const p = new Mesh(new CylinderGeometry(2.4, 2.6, 0.3, 24), new MeshLambertMaterial({ color: "#c8b48a" }));
  p.position.y = 0.15;
  return p;
}
