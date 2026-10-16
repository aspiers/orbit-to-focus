import * as THREE from 'three';
import { V, at } from './helpers.ts';

// The telescope and mount are drawn see-through so they never hide the sky or each other.
export const SOLID_OPACITY = 0.6;
export const translucent = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, transparent: true, opacity: SOLID_OPACITY, depthWrite: false, ...extra });

export function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x0 = cx - w / 2, y0 = cy - h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
// Extrudes a 2D shape (in x-y) along +z by `depth`, with softened edges.
export const extrude = (shape: THREE.Shape, depth: number, bevel = 4) =>
  new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, bevel);

export type MountKind = 'seestar' | 'dobsonian' | 'generic';

export interface Mount {
  root: THREE.Group; wedge: THREE.Group; axisA: THREE.Group; axisB: THREE.Group;
  materials: THREE.Material[];
  anchorHeight: number;     // where the camera aims when looking at the telescope (m)
  eye: THREE.Vector3;       // where you stand in "Stand here" (m, site frame)
  scopeOffset: THREE.Vector3; // telescope body centre relative to axis B (m)
}

// A tripod and a turntable (axis A) carrying an arm with the telescope on axis B.
// Alt-az mode: A is vertical (azimuth), B horizontal (altitude).
// Equatorial mode: the base tilts on a wedge so A points at the celestial pole (A = RA, B = Dec).
export function buildMount(kind: MountKind, scopeHalfWidthM: number): Mount {
  const root = new THREE.Group(), wedge = new THREE.Group(), axisA = new THREE.Group(), axisB = new THREE.Group();
  const black = translucent(0x1d2026), white = translucent(0xf1f1ec, { roughness: 0.7 }), metal = translucent(0x9aa3b5, { metalness: 0.6, roughness: 0.4 });
  const seestar = kind === 'seestar', dob = kind === 'dobsonian';
  const head = seestar ? 0.32 : dob ? 0 : 1.0, spread = seestar ? 0.17 : 0.45;
  for (let i = 0; i < (dob ? 0 : 3); i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5, foot = V(Math.cos(a) * spread, 0, Math.sin(a) * spread), top = V(0, head - 0.02, 0);
    const len = foot.distanceTo(top), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), top.clone().sub(foot).normalize());
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(seestar ? 0.008 : 0.014, seestar ? 0.01 : 0.017, len, 10), seestar ? black : metal);
    leg.position.copy(foot.clone().lerp(top, 0.5)); leg.quaternion.copy(q);
    root.add(leg);
    if (seestar) { // foam grip on the upper half of each leg
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len * 0.45, 12), black);
      grip.position.copy(foot.clone().lerp(top, 0.62)); grip.quaternion.copy(q);
      root.add(grip);
    }
  }
  if (!dob) root.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.04, 20), black), 0, head - 0.02, 0));
  wedge.position.y = head;
  root.add(wedge);
  if (!dob) wedge.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.07), black), 0, 0.006, 0));
  axisA.position.y = dob ? 0.03 : 0.012;
  wedge.add(axisA);
  axisA.add(axisB);
  let anchorHeight: number, eye: THREE.Vector3, scopeOffset: THREE.Vector3;

  if (seestar) {
    // Seestar S50 Pro body from ZWO's drawing: an L-shaped white housing 257 mm tall, a 130 mm wide column
    // with an arched top on the base, and the optical unit beside it on a hub (the altitude axis).
    const body = new THREE.Group();
    body.scale.setScalar(0.001);
    axisA.add(body);
    const arch = new THREE.Shape();
    arch.moveTo(-65, 0); arch.lineTo(65, 0); arch.lineTo(65, 192); arch.absarc(0, 192, 65, 0, Math.PI, false); arch.lineTo(-65, 0);
    const column = new THREE.Mesh(extrude(arch, 70, 5).rotateY(Math.PI / 2), white);
    body.add(column); // spans x 0..70
    const foot = new THREE.Mesh(extrude(roundedRect(142, 60, 14, -1, 30), 130, 5).translate(0, 0, -65), white);
    body.add(foot);
    const panel = new THREE.Mesh(extrude(roundedRect(48, 170, 22, 0, 110), 3, 1).rotateY(Math.PI / 2), black);
    body.add(at(panel, 70, 0, 0)); // glossy front panel with the power button
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 8, 40).rotateZ(Math.PI / 2), black);
    body.add(at(hub, -4, 192, 0));
    axisB.position.set(0, 0.192, 0);
    scopeOffset = V(-0.008 - scopeHalfWidthM, 0, -0.012);
    anchorHeight = head + 0.17;
    eye = V(-0.9, 1.6, 1.1);
  } else if (dob) {
    // Rocker box: a ground board that stays put, and a box that turns on it holding the tube on two altitude
    // bearings, high enough for the tube to clear the base when it points straight up.
    const wood = translucent(0x9a7650);
    root.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 40), wood), 0, 0.0125, 0));
    const side = scopeHalfWidthM + 0.035;
    axisA.add(at(new THREE.Mesh(new THREE.BoxGeometry(2 * side + 0.02, 0.02, 0.34), wood), 0, 0.01, 0));
    for (const x of [-side, side]) {
      axisA.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.32), wood), x, 0.25, 0));
      axisB.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 28).rotateZ(Math.PI / 2), black), x - Math.sign(x) * 0.023, 0, 0));
    }
    axisA.add(at(new THREE.Mesh(new THREE.BoxGeometry(2 * side, 0.18, 0.02), wood), 0, 0.09, 0.15));
    axisB.position.set(0, 0.47, 0);
    scopeOffset = V(0, 0, 0);
    anchorHeight = 0.47;
    eye = V(-1.3, 1.6, 1.5);
    return { root, wedge, axisA, axisB, materials: [black, white, metal, wood], anchorHeight, eye, scopeOffset };
  } else {
    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.085, 0.05, 32), black);
    axisA.add(at(turntable, 0, 0.025, 0));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.1), black);
    axisA.add(at(arm, 0.045, 0.2, 0));
    axisB.position.set(0, 0.32, 0);
    scopeOffset = V(-0.035 - scopeHalfWidthM, 0, 0);
    anchorHeight = head + 0.3;
    eye = V(-1.3, 1.6, 1.5);
  }
  return { root, wedge, axisA, axisB, materials: [black, white, metal], anchorHeight, eye, scopeOffset };
}
