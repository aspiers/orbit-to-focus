/// <reference types="vite/client" />
import * as THREE from 'three';

// Browser tests only (vite build --mode e2e; the branch is dropped from other builds). Reports what the main
// camera showed on each rendered frame as window.__otf, so tests can assert numbers rather than pixels. It
// hooks three.js from outside the scene: the sky backdrop is rendered first each frame, the main scene second.
export interface FrameInfo {
  frame: number; t: number; fov: number;
  pos: [number, number, number]; fwd: [number, number, number]; up: [number, number, number];
  scope: [number, number] | null; // the telescope's centre on screen, CSS pixels from the canvas's top left
  polar: [number, number, number] | null; // the mount's turntable axis (axis A) at your site: x east, y up, z south
  earth: [number, number, number] | null; // the Earth's centre and radius on screen, CSS pixels
}

if (import.meta.env.MODE === 'e2e') {
  let backdrop: THREE.Scene | null = null, tube: THREE.Object3D | null = null, frames = 0;
  const log: FrameInfo[] = [];
  const v = new THREE.Vector3(), u = new THREE.Vector3(), q = new THREE.Quaternion(), qBase = new THREE.Quaternion();
  const arr = (x: THREE.Vector3) => x.toArray() as [number, number, number];
  const inScene = (o: THREE.Object3D | null, root: THREE.Object3D) => { while (o && o !== root) o = o.parent; return !!o; };
  // The tube is the group just before opticsFrame (a bare Object3D) and the pointer line on axis B.
  const findTube = (root: THREE.Object3D) => {
    let found: THREE.Object3D | null = null;
    root.traverse((o) => {
      const sib = o.parent?.children ?? [], i = sib.indexOf(o);
      if (o.constructor === THREE.Object3D && (sib[i + 1] as THREE.Line | undefined)?.isLine && (sib[i - 1] as THREE.Group | undefined)?.isGroup) found = sib[i - 1];
    });
    return found;
  };
  THREE.Scene.prototype.onBeforeRender = function (renderer: THREE.WebGLRenderer, _scene: THREE.Object3D, cam: THREE.Camera) {
    backdrop ??= this;
    if (this === backdrop) return;
    const camera = cam as THREE.PerspectiveCamera, el = renderer.domElement;
    if (!inScene(tube, this)) tube = findTube(this);
    let scope: [number, number] | null = null, polar: [number, number, number] | null = null, earth: [number, number, number] | null = null;
    if (tube) {
      // The Earth's system is the tube's ancestor at the top of the scene; the Earth itself has radius 1 in it.
      let sys = tube;
      while (sys.parent && sys.parent !== this) sys = sys.parent;
      const r = sys.getWorldScale(u).x, c = sys.getWorldPosition(v).clone().project(camera);
      const edge = v.add(u.set(r, 0, 0).applyQuaternion(camera.quaternion)).project(camera);
      if (Math.abs(c.z) <= 1) earth = [((c.x + 1) / 2) * el.clientWidth, ((1 - c.y) / 2) * el.clientHeight, (Math.abs(edge.x - c.x) / 2) * el.clientWidth];
      tube.getWorldPosition(v).project(camera);
      if (Math.abs(v.z) <= 1) scope = [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
      // tube -> axis B -> axis A -> wedge -> the mount's base, which sits square to the site.
      const axisA = tube.parent?.parent, base = axisA?.parent?.parent;
      if (axisA && base) polar = arr(v.set(0, 1, 0).applyQuaternion(axisA.getWorldQuaternion(q)).applyQuaternion(base.getWorldQuaternion(qBase).invert()));
    }
    log.push({
      frame: ++frames, t: performance.now(), fov: camera.fov, pos: arr(camera.getWorldPosition(v)),
      fwd: arr(camera.getWorldDirection(v)), up: arr(v.copy(camera.up)), scope, polar, earth,
    });
    if (log.length > 2000) log.splice(0, 1000); // tests only look at recent frames
  };
  (window as unknown as { __otf: unknown }).__otf = { log, last: () => log.at(-1) ?? null, since: (frame: number) => log.filter((f) => f.frame > frame) };
}
