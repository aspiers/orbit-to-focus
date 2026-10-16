import * as THREE from 'three';
import { rayFan, type Conic, type Telescope, type Wave } from '../optics.ts';
import { COLORS } from '../constants.ts';
import { V, lerp, lineMat, polyline } from './helpers.ts';
import { extrude, roundedRect, translucent } from './mount.ts';

// Seestar optical unit: a rounded box 72 x 100 mm across and 170 mm long (from ZWO's drawing).
const SEESTAR_OTA: [number, number, number] = [72, 100, 170];
export const scopeHalfWidth = (t: Telescope) => (t.seestarBody ? SEESTAR_OTA[0] / 2 : t.box ? t.box[0] / 2 : t.rTube) / 1000;

const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xb8e6ff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
const mirrorMat = () => new THREE.MeshStandardMaterial({ color: 0xd6e0ee, metalness: 0.25, roughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });

// Profile of a conic surface from radius r0 to r1 as (r, u) pairs.
const sagAt = (s: Conic, r: number) => (isFinite(s.R) ? (r * r) / (s.R + Math.sign(s.R) * Math.sqrt(Math.max(0, s.R * s.R - (1 + s.k) * r * r))) : 0);
const profile = (s: Conic, r0: number, r1: number, n = 24): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const r = lerp(r0, r1, i / n); return [r, s.u0 + sagAt(s, r)]; });
const lathe = (pts: [number, number][], mat: THREE.Material) => {
  const g = new THREE.LatheGeometry(pts.map(([r, u]) => new THREE.Vector2(r, u)), 64);
  g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, mat);
};

// The camera view's canvas, for showing the patch of sky on the lens and sensor: `k` is canvas pixels per unit of
// tan(angle) off the axis, and `R` the radius of the drawn field in canvas pixels.
export interface SkyImage { tex: THREE.Texture; W: number; H: number; k: number; R: number }

export interface ScopeModel {
  group: THREE.Group;        // child of axis B, tube along +z, metres
  optics: THREE.Group;       // millimetres, u along +z, v along +y
  inner: THREE.Group;        // the optics proper: shown only when looking inside (the ray slice is the tube's y-z plane)
  ann: THREE.Group;          // dimension lines
  bodyMaterials: THREE.Material[];
  skyTextures: THREE.Texture[]; // refresh these when the camera view is redrawn
  focus: THREE.Object3D;
  updateRays(angle: number, alpha: number): void;
}

const WAVE_RGB: Record<Wave, [number, number, number]> = { r: [1, 0.3, 0.25], g: [0.75, 1, 0.35], b: [0.3, 0.5, 1] };
const MONO_RGB: [number, number, number] = [1, 0.9, 0.6];

export function buildScopeModel(scope: Telescope, img: SkyImage): ScopeModel {
  const group = new THREE.Group(), optics = new THREE.Group(), inner = new THREE.Group(), ann = new THREE.Group();
  optics.scale.setScalar(0.001);
  group.add(optics);
  optics.add(inner);
  inner.add(ann);
  const glass = glassMat(), mirror = mirrorMat();
  const bodyMat = translucent(scope.seestarBody ? 0xf1f1ec : scope.color, { side: THREE.DoubleSide });
  const black = translucent(0x14161b);
  const bodyMaterials: THREE.Material[] = [bodyMat, black];
  // Each use crops the shared canvas differently, so each gets its own copy of the texture.
  const skyTextures: THREE.Texture[] = [];
  const skyMat = (repeat: [number, number], offset: [number, number]) => {
    const t = img.tex.clone();
    t.repeat.set(...repeat); t.offset.set(...offset);
    skyTextures.push(t);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  };
  const { W, H, k, R } = img;
  // The front shows the patch of sky upright, as a reflection would: +x to the right, +y up.
  const frontSky = () => skyMat([(2 * R) / W, (-2 * R) / H], [(W / 2 - R) / W, 1 - (H / 2 - R) / H]);

  if (scope.seestarBody) {
    // The real light path is folded to fit this box; the optics here are drawn unfolded, lens at the front face.
    const [w, h, len] = SEESTAR_OTA;
    const ota = new THREE.Group();
    ota.scale.setScalar(0.001);
    group.add(ota);
    ota.add(new THREE.Mesh(extrude(roundedRect(w, h, 26), len, 6).translate(0, 0, -len / 2), bodyMat));
    const face = len / 2 + 0.5;
    ota.add(new THREE.Mesh(new THREE.RingGeometry(26, 31, 48).translate(0, 8, face), black));
    ota.add(new THREE.Mesh(new THREE.CircleGeometry(26, 48).translate(0, 8, face - 0.3), frontSky()));
    ota.add(new THREE.Mesh(new THREE.CircleGeometry(7, 24).translate(0, -34, face), black)); // wide-angle camera
    optics.position.set(0, 0.008, (face - scope.uAperture - 1) * 0.001);
  } else {
    const len = scope.u1 - scope.u0, mid = (scope.u0 + scope.u1) / 2;
    const body = scope.box
      ? new THREE.Mesh(new THREE.BoxGeometry(scope.box[0], scope.box[1], len), bodyMat)
      : new THREE.Mesh(new THREE.CylinderGeometry(scope.rTube, scope.rTube, len, 48, 1, true).rotateX(Math.PI / 2), bodyMat);
    body.position.z = mid;
    optics.add(body);
    optics.add(new THREE.Mesh(new THREE.CircleGeometry(scope.aperture / 2, 48).translate(0, 0, scope.uAperture + 2), frontSky()));
    optics.position.z = -mid * 0.001;
  }

  if (scope.lens) {
    const ss = scope.lens.surfaces;
    for (let i = 0; i < ss.length - 1; i++) {
      if (!ss[i].below) continue;
      const r = ss[i].rMax - 1;
      inner.add(lathe([...profile(ss[i], 0, r), ...profile(ss[i + 1], r, 0)], glass));
    }
  }
  for (const m of scope.mirrors ?? []) {
    const r0 = m.rMin ?? 0, r1 = m.rMax, th = (m.facing ?? 1) * 6;
    inner.add(lathe([...profile(m, r0, r1), ...profile(m, r1, r0).map(([r, u]): [number, number] => [r, u - th])], mirror));
  }
  if (scope.diagonal) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(17, 32), mirror);
    d.scale.set(1, 1.414, 1);
    d.position.set(0, scope.diagonal.c[1], scope.diagonal.c[0]);
    d.lookAt(d.position.clone().add(V(0, scope.diagonal.n[1], scope.diagonal.n[0])));
    inner.add(d);
  }
  if (scope.corrector) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(scope.corrector.half, scope.corrector.half, 4, 64).rotateX(Math.PI / 2), glass);
    plate.position.z = scope.corrector.u0;
    inner.add(plate);
  }
  if (scope.focuser) {
    const f = scope.focuser;
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r, f.len, 24, 1, true), bodyMat);
    ft.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, f.axis[1], f.axis[0]));
    ft.position.set(0, f.c[1] + (f.axis[1] * f.len) / 2, f.c[0] + (f.axis[0] * f.len) / 2);
    optics.add(ft);
  }
  if (scope.eyepiece) {
    const e = scope.eyepiece, a = V(0, e.n[1], e.n[0]);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 40, 24, 1, true), black);
    barrel.quaternion.setFromUnitVectors(V(0, 1, 0), a);
    barrel.position.set(0, e.c[1], e.c[0]).addScaledVector(a, 8);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 3, 24), glass);
    lens.quaternion.copy(barrel.quaternion);
    lens.position.set(0, e.c[1], e.c[0]);
    optics.add(barrel);
    inner.add(lens);
  }
  if (scope.sensor) {
    const [sw, sh] = scope.sensor;
    const chip = new THREE.Mesh(new THREE.BoxGeometry(sh, sw, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a3fa0, metalness: 0.5, roughness: 0.3, emissive: 0x1a0f3a, transparent: true, opacity: 0.45, depthWrite: false }));
    chip.position.set(0, 0, scope.focus[0] - 0.3);
    const board = new THREE.Mesh(new THREE.BoxGeometry(sh + 14, sw + 14, 2), new THREE.MeshStandardMaterial({ color: 0x1f5130, transparent: true, opacity: 0.35, depthWrite: false }));
    board.position.set(0, 0, scope.focus[0] - 1.8);
    inner.add(chip, board);
    // The image as it lands on the sensor, seen from the lens side: upside down and mirrored. A point (X, Y) on the
    // sensor receives light from the direction (-X, -Y) / focal length.
    const f = scope.focalLength;
    const image = new THREE.Mesh(new THREE.PlaneGeometry(sh, sw), skyMat(
      [(-k * sh) / (f * W), (k * sw) / (f * H)], [0.5 + (k * sh) / (2 * f * W), 0.5 - (k * sw) / (2 * f * H)]));
    image.position.set(0, 0, scope.focus[0] + 0.05);
    inner.add(image);
  }

  // Dimension lines for aperture and focal length, and the field-of-view wedge set by the sensor.
  const dimMat = lineMat(COLORS.brass, 0.9);
  const seg = (a: [number, number], b: [number, number], m: THREE.Material = dimMat) => {
    const l = polyline([V(0, a[0], a[1]), V(0, b[0], b[1])], m);
    l.computeLineDistances();
    ann.add(l);
  };
  const r = scope.aperture / 2, ua = scope.uAperture + 14;
  seg([-r, ua], [r, ua]); seg([-r, ua - 5], [-r, ua + 5]); seg([r, ua - 5], [r, ua + 5]);
  if (scope.lens) {
    const f0 = scope.focus[0], pz = f0 + scope.focalLength, x = -(scope.rTube + 12);
    seg([x, f0], [x, pz]); seg([x - 5, f0], [x + 5, f0]); seg([x - 5, pz], [x + 5, pz]);
    const guide = new THREE.LineDashedMaterial({ color: COLORS.brass, transparent: true, opacity: 0.45, dashSize: 4, gapSize: 4 });
    seg([x, pz], [r, pz], guide); seg([x, f0], [0, f0], guide);
    if (scope.sensor) {
      const wedge = new THREE.LineDashedMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.8, dashSize: 6, gapSize: 4 });
      for (const s of [-1, 1]) {
        const e: [number, number] = [(s * scope.sensor[0]) / 2, f0], dir = [-e[0], pz - f0], k = (ua + 260 - f0) / dir[1];
        seg(e, [e[0] + dir[0] * k, f0 + dir[1] * k], wedge);
      }
    }
  }

  // Rays: one buffer reused every frame.
  const MAX = 6000;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  const rayMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rays = new THREE.LineSegments(geo, rayMat);
  rays.frustumCulled = false;
  rays.renderOrder = 1; // after the glass: sorted by distance they swap with the lens frame to frame and flicker
  inner.add(rays);

  let traced = NaN;
  const focus = new THREE.Object3D();
  focus.position.set(0, scope.focus[1], scope.focus[0]);
  optics.add(focus);

  return {
    group, optics, inner, ann, bodyMaterials, skyTextures, focus,
    updateRays(angle, alpha) {
      rays.visible = alpha > 0.01;
      rayMat.opacity = alpha;
      // Re-trace only for a visible change: sub-pixel shifts every frame make the dense fan shimmer.
      if (!rays.visible || Math.abs(angle - traced) < 2e-4) return;
      traced = angle;
      const pos = geo.attributes.position.array as Float32Array, col = geo.attributes.color.array as Float32Array;
      let n = 0;
      for (const ray of rayFan(scope, angle, 15)) {
        const c = scope.waves.length > 1 ? WAVE_RGB[ray.wave] : MONO_RGB;
        for (let i = 0; i < ray.pts.length - 1 && n < MAX - 2; i++) {
          for (const p of [ray.pts[i], ray.pts[i + 1]]) {
            pos.set([0, p[1], p[0]], n * 3);
            col.set([c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], n * 3);
            n++;
          }
        }
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
