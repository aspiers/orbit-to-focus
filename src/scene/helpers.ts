import * as THREE from 'three';
import { D2R, sphToVec, type Vec3 } from '../astro.ts';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const vec = (a: Vec3) => new THREE.Vector3(...a);
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (x: number, a: number, b: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lineMat = (color: number, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
export const polyline = (pts: THREE.Vector3[], mat: THREE.Material) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
export const circle = (r: number, n = 256, f = (t: number) => V(Math.cos(t) * r, 0, -Math.sin(t) * r)) =>
  Array.from({ length: n + 1 }, (_, i) => f((i / n) * Math.PI * 2));

type WithMaterial = THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
// Fades every material under `obj`, remembering each one's own opacity the first time.
export function setAlpha(obj: THREE.Object3D, a: number) {
  obj.visible = a > 0.01;
  obj.traverse((o: WithMaterial) => {
    if (!o.material) return;
    for (const m of ([] as THREE.Material[]).concat(o.material)) {
      m.userData.base ??= m.opacity;
      m.opacity = m.userData.base * a;
      m.transparent = true;
    }
  });
}

// Lines of constant latitude/longitude on a sphere in the sphToVec convention.
export function sphereGrid(r: number, latStep: number, lonStep: number, color: number, opacity: number, emphasis: boolean) {
  const g = new THREE.Group();
  const m = lineMat(color, opacity), me = lineMat(color, Math.min(1, opacity * 3));
  for (let lat = -90 + latStep; lat < 90; lat += latStep)
    g.add(polyline(circle(1, 256, (t) => vec(sphToVec(t, lat * D2R)).multiplyScalar(r)), lat === 0 && emphasis ? me : m));
  for (let lon = 0; lon < 360; lon += lonStep)
    g.add(polyline(Array.from({ length: 129 }, (_, i) => vec(sphToVec(lon * D2R, (-90 + (180 * i) / 128) * D2R)).multiplyScalar(r)), m));
  return g;
}

// Direction for an azimuth (from north through east) and altitude, in the site frame: x east, y up, z south.
export const altAzDir = (az: number, alt: number) => V(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));

export function bvColor(bv: number) {
  const t = clamp((bv + 0.3) / 2.0, 0, 1);
  return new THREE.Color().setRGB(lerp(0.65, 1, smooth(t, 0, 0.45)), 0.75 + 0.15 * (1 - Math.abs(t - 0.35) * 2), lerp(1, 0.45, smooth(t, 0.25, 1)));
}

export function canvas2d(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D] as const;
}
