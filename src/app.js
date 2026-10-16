// Scene, camera, interface and lessons. Relies on astro.js, optics.js and data.js being concatenated first.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const vec = (a) => new THREE.Vector3(...a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// World units: Earth radius = 1. Distances between bodies are shrunk so everything fits on screen.
const SUN_R = 12, ORBIT_R = 220, MOON_ORBIT_R = 14, MOON_R = 0.27, SHELL_R = 4, METRE = 1 / 6371000 * 60;
// METRE: site objects are drawn 60x larger than true scale relative to Earth so the zoom stays smooth.
const MM = METRE / 1000;
const SKY_R = 1000; // background sky sphere, centred on the camera

const COLORS = { eq: 0x5cc8ff, ecl: 0xff9b45, hor: 0x7fdc8c, mer: 0xff6fa8, moon: 0xc7c0ff, sun: 0xffd27a, axis: 0xffffff, brass: 0xe0b866 };

const TARGETS = [
  ['Vega', 279.234, 38.784], ['Polaris', 37.95, 89.264], ['Arcturus', 213.915, 19.182], ['Betelgeuse', 88.793, 7.407],
  ['Sirius', 101.287, -16.716], ['Capella', 79.172, 45.998], ['Altair', 297.696, 8.868], ['Deneb', 310.358, 45.28],
  ['Rigel', 78.634, -8.202], ['Spica', 201.298, -11.161], ['Antares', 247.352, -26.432], ['Pleiades (M45)', 56.871, 24.105],
  ['Mizar & Alcor', 200.981, 54.925], ['Orion Nebula (M42)', 83.822, -5.391], ['Andromeda Galaxy (M31)', 10.685, 41.269],
  ['Albireo', 292.68, 27.96], ['Moon', null, null],
];

const SPEEDS = [['Paused', 0], ['Real time', 1], ['1 min / s', 60], ['10 min / s', 600], ['1 hour / s', 3600], ['6 hours / s', 21600], ['1 day / s', 86400], ['1 week / s', 604800]];

const PLACES = [
  ['Your site', 51.4769, -0.0005], ['Greenwich Observatory', 51.4769, -0.0005], ['Equator (Quito)', -0.18, -78.47],
  ['North Pole', 89.99, 0], ['Sydney', -33.87, 151.21], ['Mauna Kea', 19.82, -155.47],
];

// Camera zoom is log10 of distance in world units; LM is one metre at the site's scale.
const LM = Math.log10(METRE);
const STOPS = [
  { id: 'solar', name: 'Solar system', hint: 'Earth’s orbit', L: 2.85, pitch: 28 },
  { id: 'moon', name: 'Earth & Moon', hint: 'Moon’s orbit', L: 1.6, pitch: 22 },
  { id: 'earth', name: 'Earth & sky', hint: 'celestial sphere', L: 1.08, pitch: 18 },
  { id: 'site', name: 'Your site', hint: '15 m away', L: LM + 1.18, pitch: 7 },
  { id: 'scope', name: 'Telescope', hint: '5 m away', L: LM + 0.72, pitch: 12 },
  { id: 'optics', name: 'Inside the tube', hint: 'lens to sensor', L: LM - 0.35, pitch: 0 },
  { id: 'focus', name: 'At the focus', hint: 'a few mm', L: LM - 2.2, pitch: 0 },
];

// Sensors stored as [short side, long side] in mm; the short side lies in the drawn slice.
const SENSORS = [
  ['Seestar S50 Pro (1/1.2″)', 6.264, 11.136], ['Seestar S50 (1/2.8″)', 3.132, 5.568],
  ['Micro Four Thirds', 13, 17.3], ['APS-C', 15.6, 23.5], ['Full frame', 24, 36],
];

// ---------- state ----------
const state = {
  time: Date.now(), speed: 1, lat: 51.4769 * D2R, lon: -0.0005 * D2R,
  target: 0, customRa: 0, customDec: 0, mountMode: 'altaz', tracking: true, telescope: 'seestar', corrected: true,
  custom: { ...SEESTAR }, sensorPreset: 0,
  layers: { eq: true, ecl: true, hor: true, mer: true, con: true, names: true, moonOrbit: true, ground: false, labels: true },
  mode: 'orbit', cam: { L: 2.85, yaw: 0.6, pitch: 28 * D2R }, eye: { yaw: Math.PI, pitch: 30 * D2R, fov: 70 },
  axes: { a: 0, b: 0 }, tilt: 0, lesson: 0,
};

// ---------- renderer & scenes ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
const scene = new THREE.Scene();
const bgScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 1e-9, 1e5);
const bgCamera = new THREE.PerspectiveCamera(50, 1, 1, SKY_R * 3);

const fadeMats = new Set();
const lineMat = (color, opacity = 1, extra = {}) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });
const setAlpha = (obj, a) => {
  obj.visible = a > 0.01;
  obj.traverse((o) => {
    const ms = o.material ? [].concat(o.material) : [];
    for (const m of ms) { m.userData.base ??= m.opacity; m.opacity = m.userData.base * a; m.transparent = true; }
  });
};
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const polyline = (pts, mat) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
const circle = (r, n = 256, f = (t) => V(Math.cos(t) * r, 0, -Math.sin(t) * r)) => Array.from({ length: n + 1 }, (_, i) => f((i / n) * Math.PI * 2));

// Lines of constant latitude/longitude on a sphere in the sphToVec convention.
function sphereGrid(r, latStep, lonStep, color, opacity, emphasis) {
  const g = new THREE.Group();
  const m = lineMat(color, opacity), me = lineMat(color, Math.min(1, opacity * 3));
  for (let lat = -90 + latStep; lat < 90; lat += latStep)
    g.add(polyline(circle(1, 256, (t) => vec(sphToVec(t, lat * D2R)).multiplyScalar(r)), lat === 0 && emphasis ? me : m));
  for (let lon = 0; lon < 360; lon += lonStep)
    g.add(polyline(Array.from({ length: 129 }, (_, i) => vec(sphToVec(lon * D2R, (-90 + (180 * i) / 128) * D2R)).multiplyScalar(r)), m));
  return g;
}

function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,180,80,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(',1)', ',0.6)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Equirectangular Earth texture drawn from the coastline data.
function earthTexture() {
  const W = 4096, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#163a6b'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#4c6b3c'; x.strokeStyle = '#9fb58a'; x.lineWidth = 2;
  for (const ring of DATA.land) {
    x.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const px = ((ring[i] + 180) / 360) * W, py = ((90 - ring[i + 1]) / 180) * H;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.fill(); x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 15) { x.beginPath(); x.moveTo(((lon + 180) / 360) * W, 0); x.lineTo(((lon + 180) / 360) * W, H); x.stroke(); }
  for (let lat = -75; lat <= 75; lat += 15) { x.beginPath(); x.moveTo(0, ((90 - lat) / 180) * H); x.lineTo(W, ((90 - lat) / 180) * H); x.stroke(); }
  x.strokeStyle = 'rgba(255,214,120,0.7)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Moon texture with rough near-side maria, so tidal locking is visible.
function moonTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#a9a9a4'; x.fillRect(0, 0, W, H);
  const maria = [[-15, 35, 16, 11], [17, 28, 9, 8], [31, 8, 10, 8], [59, 17, 6, 5], [-45, 15, 22, 25], [-17, -20, 11, 8], [51, -4, 8, 9], [35, -14, 7, 7], [-37, -24, 7, 5]];
  x.fillStyle = '#5f605e';
  for (const [lon, lat, rx, ry] of maria) {
    x.beginPath(); x.ellipse(((lon + 180) / 360) * W, ((90 - lat) / 180) * H, (rx / 360) * W, (ry / 180) * H, 0, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- solar system ----------
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
sunGlow.scale.setScalar(SUN_R * 7);
scene.add(sun, sunGlow);
const sunLight = new THREE.PointLight(0xffffff, 3.2, 0, 0);
scene.add(sunLight, new THREE.AmbientLight(0x8090b0, 0.16));

const solarGroup = new THREE.Group();
solarGroup.add(polyline(circle(ORBIT_R), lineMat(0x8fa0c8, 0.45)));
const eclPlane = new THREE.Mesh(new THREE.RingGeometry(SUN_R * 1.5, ORBIT_R * 1.25, 96), new THREE.MeshBasicMaterial({ color: COLORS.ecl, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
eclPlane.rotation.x = -Math.PI / 2;
solarGroup.add(eclPlane);
const seasonMarks = [['March equinox', 0], ['June solstice', 90], ['September equinox', 180], ['December solstice', 270]].map(([name, lon]) => {
  const p = vec(sphToVec(lon * D2R, 0)).multiplyScalar(-ORBIT_R); // Earth sits opposite the Sun's direction
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8fa0c8, transparent: true }));
  m.position.copy(p); solarGroup.add(m);
  return { name, p };
});
scene.add(solarGroup);

// ---------- Earth system ----------
const earthSys = new THREE.Group();      // at Earth's centre, ecliptic-aligned axes
const tilt = new THREE.Group();          // equatorial frame fixed to the stars
tilt.rotation.x = -OBLIQUITY;
const spin = new THREE.Group();          // rotates with the Earth
tilt.add(spin);
earthSys.add(tilt);
scene.add(earthSys);

const earthMat = new THREE.MeshPhongMaterial({ map: earthTexture(), shininess: 6, transparent: true });
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), earthMat);
spin.add(earth);
const axisLine = polyline([V(0, -1.9, 0), V(0, 1.9, 0)], lineMat(COLORS.axis, 0.85));
tilt.add(axisLine);

// Celestial sphere model around the Earth.
const shell = new THREE.Group();
const shellEq = sphereGrid(SHELL_R, 15, 30, COLORS.eq, 0.22, true);
const shellPoles = polyline([V(0, -SHELL_R, 0), V(0, SHELL_R, 0)], lineMat(COLORS.eq, 0.35));
shell.add(shellEq, shellPoles);
tilt.add(shell);
const shellEcl = polyline(circle(SHELL_R), lineMat(COLORS.ecl, 0.9));
earthSys.add(shellEcl);
const shellSun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: COLORS.sun, transparent: true }));
earthSys.add(shellSun);
const shellTarget = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 24), new THREE.MeshBasicMaterial({ color: COLORS.brass, transparent: true, side: THREE.DoubleSide }));
tilt.add(shellTarget);

// Moon and its orbit.
const moon = new THREE.Group();
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 48, 24), new THREE.MeshPhongMaterial({ map: moonTexture(), shininess: 2, transparent: true }));
moonMesh.rotation.y = -Math.PI / 2; // puts selenographic longitude 0 on +Z, which lookAt aims at Earth
moon.add(moonMesh);
earthSys.add(moon);
let moonOrbit = null, moonOrbitTime = -Infinity;
function updateMoonOrbit() {
  if (Math.abs(state.time - moonOrbitTime) < 86400000) return;
  moonOrbitTime = state.time;
  const pts = Array.from({ length: 241 }, (_, i) => {
    const e = moonEcliptic(state.time + (i / 240) * 27.32 * 86400000);
    return vec(sphToVec(e.lon, e.lat)).multiplyScalar(MOON_ORBIT_R);
  });
  if (moonOrbit) { earthSys.remove(moonOrbit); moonOrbit.geometry.dispose(); }
  moonOrbit = polyline(pts, lineMat(COLORS.moon, 0.55));
  earthSys.add(moonOrbit);
}

// Site marker at Earth scale: local horizon plane and the meridian through the site.
const siteBig = new THREE.Group();
spin.add(siteBig);
const horizonDisc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ color: COLORS.hor, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
horizonDisc.rotation.x = -Math.PI / 2;
const horizonRim = polyline(circle(1.5, 96), lineMat(COLORS.hor, 0.7));
const zenithArrow = polyline([V(0, 0, 0), V(0, 1.6, 0)], lineMat(COLORS.hor, 0.9));
const sitePin = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.brass }));
siteBig.add(horizonDisc, horizonRim, zenithArrow, sitePin);
const meridianShell = new THREE.Group(); // great circle through the poles and the site's zenith
spin.add(meridianShell);

// ---------- the observing site (metres) ----------
const site = new THREE.Group();
spin.add(site);
site.scale.setScalar(METRE);
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 96), new THREE.MeshLambertMaterial({ color: 0x2a3a2a, transparent: true, side: THREE.DoubleSide }));
ground.rotation.x = -Math.PI / 2;
site.add(ground);
const compass = new THREE.Group();
compass.add(polyline([V(0, 0.01, 3), V(0, 0.01, -3)], lineMat(0xaab4cc, 0.5)), polyline([V(-3, 0.01, 0), V(3, 0.01, 0)], lineMat(0xaab4cc, 0.5)));
compass.add(polyline([V(-0.25, 0.01, -2.6), V(0, 0.01, -3.1), V(0.25, 0.01, -2.6)], lineMat(COLORS.mer, 0.9)));
site.add(compass);
const siteLight = new THREE.HemisphereLight(0xb8c6ff, 0x1a2418, 0.9);
site.add(siteLight);

// Tripod and Seestar-style mount: a turntable (axis A) carrying an arm with the body on axis B.
// Alt-az mode: A is vertical (azimuth), B horizontal (altitude).
// Equatorial mode: the base is tilted on a wedge so A points at the celestial pole (A = RA, B = Dec).
const mount = new THREE.Group();
site.add(mount);
const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.6, roughness: 0.4, transparent: true });
const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.3, roughness: 0.6, transparent: true });
const HEAD = 0.75;
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2, foot = V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1, 8), metal);
  const mid = foot.clone().lerp(V(0, HEAD, 0), 0.5);
  leg.position.copy(mid); leg.scale.y = foot.distanceTo(V(0, HEAD, 0));
  leg.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, HEAD, 0).sub(foot).normalize());
  mount.add(leg);
}
const wedge = new THREE.Group();       // tilts by (90 deg - latitude) in equatorial mode
wedge.position.y = HEAD;
mount.add(wedge);
wedge.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), dark), 0, 0.01, 0));
const axisA = new THREE.Group();
axisA.position.y = 0.02;
wedge.add(axisA);
axisA.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.04, 32), dark), 0, 0.02, 0));
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.07), dark);
axisA.add(arm);
const axisB = new THREE.Group();
axisA.add(axisB);
const polarRod = polyline([V(0, -0.15, 0), V(0, 0.6, 0)], lineMat(COLORS.eq, 0.0)); // shows axis A's direction
axisA.add(polarRod);
const pointer = polyline([V(0, 0, 0), V(0, 0, 4000)], lineMat(COLORS.brass, 0.55)); // the line of sight, out to "infinity"
axisB.add(pointer);

// ---------- telescope body and optics (millimetres) ----------
let scope = null, scopeGroup = new THREE.Group(), rayLines = null;
axisB.add(scopeGroup);
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xb8e6ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xd6e0ee, metalness: 0.25, roughness: 0.25, side: THREE.DoubleSide, transparent: true });
const tubeMats = [];

// Profile of a conic surface from radius r0 to r1 as (r, u) pairs.
const sagAt = (s, r) => (isFinite(s.R) ? (r * r) / (s.R + Math.sign(s.R) * Math.sqrt(Math.max(0, s.R * s.R - (1 + s.k) * r * r))) : 0);
const lathe = (pts, mat) => { const g = new THREE.LatheGeometry(pts.map(([r, u]) => new THREE.Vector2(r, u)), 64); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, mat); };
const profile = (s, r0, r1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const r = lerp(r0, r1, i / n); return [r, s.u0 + sagAt(s, r)]; });

function buildScope() {
  scope = makeTelescope(state.telescope, state.corrected, state.custom);
  axisB.remove(scopeGroup);
  scopeGroup = new THREE.Group();
  axisB.add(scopeGroup);
  const optics = new THREE.Group();
  optics.scale.setScalar(0.001); // mm -> m
  const mid = (scope.u0 + scope.u1) / 2;
  optics.position.z = -mid * 0.001;
  // Sit the body clear of the arm.
  scopeGroup.position.x = -(scope.box ? scope.box[0] / 2 : scope.rTube) * 0.001 - 0.02;
  scopeGroup.add(optics);
  tubeMats.length = 0;
  const tubeMat = new THREE.MeshStandardMaterial({ color: scope.color, metalness: 0.2, roughness: 0.55, transparent: true, side: THREE.DoubleSide });
  tubeMats.push(tubeMat);
  const len = scope.u1 - scope.u0;
  const body = scope.box
    ? new THREE.Mesh(new THREE.BoxGeometry(scope.box[0], scope.box[1], len), tubeMat)
    : new THREE.Mesh(new THREE.CylinderGeometry(scope.rTube, scope.rTube, len, 48, 1, true).rotateX(Math.PI / 2), tubeMat);
  body.position.z = mid;
  optics.add(body);
  // Lenses
  if (scope.lens) {
    const ss = scope.lens.surfaces;
    for (let i = 0; i < ss.length - 1; i++) {
      if (!ss[i].below) continue;
      const r = ss[i].rMax - 1;
      optics.add(lathe([...profile(ss[i], 0, r), ...profile(ss[i + 1], r, 0)], glassMat));
    }
  }
  for (const m of scope.mirrors || []) {
    const r0 = m.rMin || 0, r1 = m.rMax, th = m.facing * 6;
    optics.add(lathe([...profile(m, r0, r1), ...profile(m, r1, r0).map(([r, u]) => [r, u - th])], mirrorMat));
  }
  if (scope.diagonal) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(17, 32), mirrorMat);
    d.scale.set(1, 1.414, 1);
    d.position.set(scope.diagonal.c[1], 0, scope.diagonal.c[0]);
    d.lookAt(d.position.clone().add(V(scope.diagonal.n[1], 0, scope.diagonal.n[0])));
    optics.add(d);
  }
  if (scope.corrector) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(scope.corrector.half, scope.corrector.half, 4, 64).rotateX(Math.PI / 2), glassMat);
    plate.position.z = scope.corrector.u0;
    optics.add(plate);
  }
  if (scope.focuser) {
    const f = scope.focuser;
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r, f.len, 24, 1, true), tubeMat);
    ft.quaternion.setFromUnitVectors(V(0, 1, 0), V(f.axis[1], 0, f.axis[0]));
    ft.position.set(f.c[1] + f.axis[1] * f.len / 2, 0, f.c[0] + f.axis[0] * f.len / 2);
    optics.add(ft);
  }
  if (scope.eyepiece) {
    const e = scope.eyepiece, a = V(e.n[1], 0, e.n[0]);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 40, 24, 1, true), dark);
    barrel.quaternion.setFromUnitVectors(V(0, 1, 0), a);
    barrel.position.set(e.c[1], 0, e.c[0]).addScaledVector(a, 8);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 3, 24), glassMat);
    lens.quaternion.copy(barrel.quaternion);
    lens.position.set(e.c[1], 0, e.c[0]);
    optics.add(barrel, lens);
  }
  if (scope.sensor) {
    const [sw, sh] = scope.sensor;
    const chip = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a3fa0, metalness: 0.5, roughness: 0.3, emissive: 0x1a0f3a }));
    chip.position.set(0, 0, scope.focus[0] - 0.3);
    const board = new THREE.Mesh(new THREE.BoxGeometry(sw + 14, sh + 14, 2), new THREE.MeshStandardMaterial({ color: 0x1f5130 }));
    board.position.set(0, 0, scope.focus[0] - 1.8);
    optics.add(chip, board);
  }
  // Dimension lines for aperture and focal length, and the field-of-view wedge set by the sensor.
  const ann = new THREE.Group();
  const dimMat = lineMat(COLORS.brass, 0.9);
  const seg = (a, b, m = dimMat) => { const l = polyline([V(a[0], 0, a[1]), V(b[0], 0, b[1])], m); l.computeLineDistances(); ann.add(l); };
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
        const e = [s * scope.sensor[0] / 2, f0], dir = [-e[0], pz - f0], k = (ua + 260 - f0) / dir[1];
        seg(e, [e[0] + dir[0] * k, f0 + dir[1] * k], wedge);
      }
    }
  }
  optics.add(ann);
  scopeGroup.userData.ann = ann;
  // Rays: one buffer reused every frame.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6000 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6000 * 3), 3));
  rayLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  rayLines.frustumCulled = false;
  optics.add(rayLines);
  scopeGroup.userData.optics = optics;
  focusMarker.position.set(scope.focus[1] * 0.001, 0, (scope.focus[0] - mid) * 0.001);
  scopeGroup.add(focusMarker);
  updateScopeUI();
}
const focusMarker = new THREE.Object3D();
// Camera frame for the side view of the optics: looks at the ray slice (tube x-z plane) from the
// tube's +y side, away from the mount arm, with the sky end of the tube at the top of the screen.
const opticsFrame = new THREE.Object3D();
opticsFrame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
axisB.add(opticsFrame);

const WAVE_RGB = { r: [1, 0.3, 0.25], g: [0.75, 1, 0.35], b: [0.3, 0.5, 1] };
const MONO_RGB = [1, 0.9, 0.6];
function updateRays(starDirLocal, alpha) {
  if (!rayLines) return;
  // Angle of the starlight within the slice the rays are drawn in (the tube's x-z plane).
  const angle = Math.atan2(starDirLocal.x, starDirLocal.z);
  const rays = rayFan(scope, angle, 15);
  const pos = rayLines.geometry.attributes.position.array, col = rayLines.geometry.attributes.color.array;
  let n = 0;
  for (const r of rays) {
    const c = scope.waves.length > 1 ? WAVE_RGB[r.wave] : MONO_RGB;
    for (let i = 0; i < r.pts.length - 1 && n < 5990; i++) {
      for (const p of [r.pts[i], r.pts[i + 1]]) {
        pos[n * 3] = p[1]; pos[n * 3 + 1] = 0; pos[n * 3 + 2] = p[0];
        col[n * 3] = c[0] * 0.8; col[n * 3 + 1] = c[1] * 0.8; col[n * 3 + 2] = c[2] * 0.8;
        n++;
      }
    }
  }
  rayLines.geometry.setDrawRange(0, n);
  rayLines.geometry.attributes.position.needsUpdate = true;
  rayLines.geometry.attributes.color.needsUpdate = true;
  rayLines.material.opacity = alpha;
  rayLines.visible = alpha > 0.01;
}

// ---------- background sky (directions only, centred on the camera) ----------
const bgEq = new THREE.Group(); bgEq.rotation.x = -OBLIQUITY; bgScene.add(bgEq);
const bgSite = new THREE.Group(); bgScene.add(bgSite);   // follows the observer's horizon frame
const bgEcl = new THREE.Group(); bgScene.add(bgEcl);

const starVert = `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
  void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale; gl_Position=projectionMatrix*mv; }`;
const starFrag = `varying vec3 vColor; uniform float alpha;
  void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.1,d); gl_FragColor=vec4(vColor, a*alpha); }`;
function bvColor(bv) {
  const t = clamp((bv + 0.3) / 2.0, 0, 1);
  return new THREE.Color().setRGB(lerp(0.65, 1, smooth(t, 0, 0.45)), lerp(0.75, 0.75, t) + 0.15 * (1 - Math.abs(t - 0.35) * 2), lerp(1, 0.45, smooth(t, 0.25, 1)));
}
const starDirs = []; // world-frame unit vectors, for the camera view
function starPoints(radius, maxMag, sizeK) {
  const s = DATA.stars, pos = [], col = [], size = [];
  for (let i = 0; i < s.length; i += 4) {
    if (s[i + 2] > maxMag) continue;
    pos.push(...vec(sphToVec(s[i] * D2R, s[i + 1] * D2R)).multiplyScalar(radius).toArray());
    const c = bvColor(s[i + 3]); col.push(c.r, c.g, c.b);
    size.push(clamp((6.8 - s[i + 2]) * sizeK, 1.2, 9));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  return new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { scale: { value: 1 }, alpha: { value: 1 } }, vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false }));
}
const eqToWorld = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -OBLIQUITY);
for (let i = 0; i < DATA.stars.length; i += 4) starDirs.push([vec(sphToVec(DATA.stars[i] * D2R, DATA.stars[i + 1] * D2R)).applyQuaternion(eqToWorld), DATA.stars[i + 2], DATA.stars[i + 3]]);

const bgStars = starPoints(SKY_R, 6.5, 1.25);
bgEq.add(bgStars);
const shellStars = starPoints(SHELL_R * 0.995, 4.2, 0.9);
shell.add(shellStars);

const conLines = (() => {
  const pts = [];
  for (const l of DATA.lines) for (let i = 0; i < l.length - 2; i += 2)
    pts.push(vec(sphToVec(l[i] * D2R, l[i + 1] * D2R)).multiplyScalar(SKY_R), vec(sphToVec(l[i + 2] * D2R, l[i + 3] * D2R)).multiplyScalar(SKY_R));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x7d8fc0, 0.32));
})();
bgEq.add(conLines);
const bgEqGrid = sphereGrid(SKY_R, 15, 15, COLORS.eq, 0.3, true);
bgEq.add(bgEqGrid);
const bgEclLine = polyline(circle(SKY_R), lineMat(COLORS.ecl, 0.85));
bgEcl.add(bgEclLine);

// Horizon frame in the background: x east, y up, z south.
const altazGrid = new THREE.Group();
for (let alt = 10; alt < 90; alt += 10) altazGrid.add(polyline(circle(1, 128, (t) => V(Math.cos(t), 0, Math.sin(t)).multiplyScalar(Math.cos(alt * D2R) * SKY_R).setY(Math.sin(alt * D2R) * SKY_R)), lineMat(COLORS.hor, alt % 30 ? 0.22 : 0.4)));
for (let az = 0; az < 360; az += 30) altazGrid.add(polyline(Array.from({ length: 33 }, (_, i) => altAzDir(az * D2R, ((i / 32) * 90) * D2R).multiplyScalar(SKY_R)), lineMat(COLORS.hor, 0.32)));
const horizonLine = polyline(circle(SKY_R, 256, (t) => V(Math.cos(t) * SKY_R, 0, Math.sin(t) * SKY_R)), lineMat(COLORS.hor, 0.95));
const meridianLine = polyline(Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI; return V(0, Math.sin(a) * SKY_R, Math.cos(a) * SKY_R); }), lineMat(COLORS.mer, 0.95));
const belowShade = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.98, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b120c, transparent: true, opacity: 0.0, side: THREE.BackSide, depthWrite: false }));
bgSite.add(altazGrid, horizonLine, meridianLine);
function altAzDir(az, alt) { return V(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)); }

// Sun and Moon on the sky, at their geocentric directions; the Moon shows its true phase.
const skySun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,200,120,0)'), depthWrite: false, transparent: true }));
skySun.scale.setScalar(SKY_R * 0.09);
const skyMoon = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 0.012, 32, 16), new THREE.MeshLambertMaterial({ color: 0xdedbd2, transparent: true }));
const bgSunLight = new THREE.DirectionalLight(0xffffff, 2.2);
bgScene.add(skySun, skyMoon, bgSunLight, bgSunLight.target, new THREE.AmbientLight(0xffffff, 0.04));

// ---------- labels ----------
const labelLayer = $('labels');
const labels = [];
const tmpV = V();
function label(text, cls, pos, alpha, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  if (typeof text === 'function') opts.text = text; else el.textContent = text;
  labelLayer.append(el);
  labels.push({ el, pos, alpha, ...opts });
  return el;
}
function updateLabels(w, h) {
  for (const l of labels) {
    const a = state.layers.labels || l.always ? l.alpha() : 0;
    if (a < 0.03) { l.el.style.opacity = 0; continue; }
    if (l.text) { const s = l.text(); if (s !== l.last) l.el.textContent = l.last = s; }
    l.pos(tmpV);
    if (l.bg) tmpV.multiplyScalar(SKY_R).project(bgCamera); else tmpV.project(camera);
    if (tmpV.z > 1 || tmpV.z < -1 || Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) { l.el.style.opacity = 0; continue; }
    l.el.style.opacity = a;
    l.el.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px)`;
  }
}

// ---------- per-frame astronomy ----------
const sky = {}; // derived quantities for this frame
function targetRaDec(ms = state.time) {
  const t = TARGETS[state.target];
  if (t[0] === 'Moon') return eclipticToEquatorial(moonEcliptic(ms));
  if (t[0] === 'Custom') return { ra: state.customRa, dec: state.customDec };
  return { ra: t[1] * D2R, dec: t[2] * D2R };
}
function computeSky() {
  const ms = state.time;
  sky.gmst = gmst(ms);
  sky.sunEcl = sunEcliptic(ms);
  sky.moonEcl = moonEcliptic(ms);
  sky.sunDirW = vec(sphToVec(sky.sunEcl.lon, 0));
  sky.moonDirW = vec(sphToVec(sky.moonEcl.lon, sky.moonEcl.lat));
  sky.target = targetRaDec();
  sky.h = horizontal(sky.target.ra, sky.target.dec, ms, state.lat, state.lon);
  const sunEq = eclipticToEquatorial(sky.sunEcl);
  sky.sunH = horizontal(sunEq.ra, sunEq.dec, ms, state.lat, state.lon);
  sky.targetDirW = vec(sphToVec(sky.target.ra, sky.target.dec)).applyQuaternion(eqToWorld);
}

// Mount axis angles for pointing at the target: (A, B) about the turntable and the arm.
function axisAngles(h, dec) {
  return state.mountMode === 'eq' ? { a: -h.ha, b: -dec } : { a: Math.PI - h.az, b: -h.alt };
}
let slewing = true;
function updateMount(dtReal) {
  const goal = axisAngles(sky.h, sky.target.dec);
  const tiltGoal = state.mountMode === 'eq' ? -(Math.PI / 2 - state.lat) : 0;
  state.tilt += clamp(tiltGoal - state.tilt, -dtReal * 0.8, dtReal * 0.8);
  const tiltDone = Math.abs(tiltGoal - state.tilt) < 1e-4;
  if (state.tracking || slewing) {
    if (slewing || !tiltDone) {
      // Slew at up to 80 degrees per second, faster than a real mount, so lessons don't wait.
      const step = dtReal * 80 * D2R;
      const da = wrapPi(goal.a - state.axes.a), db = goal.b - state.axes.b;
      state.axes.a += clamp(da, -step, step); state.axes.b += clamp(db, -step, step);
      if (Math.abs(da) < step && Math.abs(db) < step && tiltDone) slewing = false;
    } else state.axes = goal;
  }
  wedge.rotation.x = state.tilt;
  axisA.rotation.y = state.axes.a;
  axisB.rotation.x = state.axes.b;
  axisB.position.set(0.018 + 0.02, 0.17, 0);
  arm.position.set(0.018 + 0.02, 0.1, 0);
}

// Axis speeds in degrees per hour of sky time, from a 2-minute look-ahead.
function axisRates() {
  const dt = 120000, t2 = targetRaDec(state.time + dt);
  const h2 = horizontal(t2.ra, t2.dec, state.time + dt, state.lat, state.lon);
  const a1 = axisAngles(sky.h, sky.target.dec), a2 = axisAngles(h2, t2.dec);
  const k = 3600000 / dt * R2D;
  return { a: wrapPi(a2.a - a1.a) * k, b: (a2.b - a1.b) * k };
}

// ---------- camera ----------
const anchor = { sun: V(), earth: V(), site: V(), optics: V(), focus: V() };
const qWorld = new THREE.Quaternion(), qSite = new THREE.Quaternion(), qOpt = new THREE.Quaternion(), qTmp = new THREE.Quaternion();
let anim = null;
function goTo(stopId, opts = {}) {
  const s = STOPS.find((x) => x.id === stopId);
  state.mode = 'orbit';
  // The tube view frames the whole tube, whatever its length.
  const L = s.id === 'optics' ? Math.log10(clamp((scope.u1 - scope.u0) / 1000 * 1.35, 0.45, 1.5) * METRE) : s.L;
  anim = { t: 0, from: { ...state.cam }, to: { L, yaw: opts.yaw ?? (stopId === 'optics' || stopId === 'focus' ? 0 : state.cam.yaw), pitch: (opts.pitch ?? s.pitch) * D2R } };
  syncModeUI();
}
// Yaw 0 faces south, 180 faces north.
function standHere(yawDeg = 0, pitchDeg = 30) {
  state.mode = 'eye';
  state.eye.yaw = yawDeg * D2R; state.eye.pitch = pitchDeg * D2R;
  syncModeUI();
}

function weights() {
  const L = state.cam.L;
  if (state.mode === 'eye') return { L, sol: 0, moon: 0, earth: 0, site: 1, scope: 1, opt: 0 };
  return {
    L,
    sol: smooth(L, 1.9, 2.5),
    moon: smooth(L, 1.15, 1.4) * (1 - smooth(L, 2.5, 3.0)),
    earth: smooth(L, -1.6, -0.6) * (1 - smooth(L, 1.2, 1.45)),
    site: 1 - smooth(L, LM + 2.7, LM + 3.7),
    scope: 1 - smooth(L, LM + 2.0, LM + 2.6),
    opt: 1 - smooth(L, LM + 0.25, LM + 0.5),
  };
}

function placeCamera(w) {
  const { L } = state.cam;
  const d = 10 ** L;
  anchor.earth.setFromMatrixPosition(earthSys.matrixWorld);
  site.localToWorld(anchor.site.set(0, 1.0, 0));
  scopeGroup.localToWorld(anchor.optics.set(0, 0, 0));
  focusMarker.getWorldPosition(anchor.focus);
  site.getWorldQuaternion(qSite);
  opticsFrame.getWorldQuaternion(qOpt);
  if (state.mode === 'eye') {
    const eyePos = site.localToWorld(V(-1.2, 1.6, 1.4));
    camera.position.copy(eyePos);
    const dir = V(Math.cos(state.eye.pitch) * Math.sin(state.eye.yaw), Math.sin(state.eye.pitch), Math.cos(state.eye.pitch) * Math.cos(state.eye.yaw)).applyQuaternion(qSite);
    camera.up.set(0, 1, 0).applyQuaternion(qSite);
    camera.lookAt(eyePos.clone().add(dir));
    camera.fov = state.eye.fov;
    camera.near = METRE * 0.05; camera.far = 1e5;
    return;
  }
  camera.fov = 50;
  const tFocus = 1 - smooth(L, LM - 1.6, LM - 0.8), tSite = smooth(L, LM + 0.2, LM + 0.6), tEarth = smooth(L, LM + 2.6, LM + 4.6), tSun = smooth(L, 2.0, 2.6);
  const target = anchor.optics.clone().lerp(anchor.focus, tFocus).lerp(anchor.site, tSite).lerp(anchor.earth, tEarth).lerp(anchor.sun.set(0, 0, 0), tSun);
  const fWorld = smooth(L, LM + 3.6, LM + 5.2), fSite = smooth(L, LM + 0.2, LM + 0.5);
  qTmp.copy(qOpt).slerp(qSite, fSite).slerp(qWorld, fWorld);
  const { yaw, pitch } = state.cam;
  const off = V(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)).multiplyScalar(d).applyQuaternion(qTmp);
  camera.position.copy(target).add(off);
  // Keep the camera out of the Earth while flying between scales.
  const fromEarth = camera.position.clone().sub(anchor.earth);
  if (fromEarth.length() < 1 + 2 * METRE && L > LM + 1) camera.position.copy(anchor.earth).add(fromEarth.setLength(1 + 2 * METRE));
  camera.up.set(0, 1, 0).applyQuaternion(qTmp);
  camera.lookAt(target);
  camera.near = d * 2e-3; camera.far = Math.max(d * 1e4, 3000);
}

// ---------- eyepiece / camera view ----------
const evCanvas = $('eyeview'), ev = evCanvas.getContext('2d');
const qInv = new THREE.Quaternion();
function drawEyeView(daylight) {
  const W = evCanvas.width, H = evCanvas.height, cx = W / 2, cy = H / 2;
  ev.clearRect(0, 0, W, H);
  scopeGroup.getWorldQuaternion(qInv); qInv.invert();
  // Camera sensor (Seestar) is a portrait rectangle; an eyepiece shows a circle.
  const fov = scope.sensor ? scope.field : [scope.trueField, scope.trueField];
  const half = Math.max(fov[0], fov[1]) / 2 * D2R;
  const R = Math.min(W, H) * 0.46;
  const k = R / Math.tan(half);
  const tw = scope.sensor ? (Math.tan(fov[0] / 2 * D2R) * k) : R, th = scope.sensor ? Math.tan(fov[1] / 2 * D2R) * k : R;
  ev.save();
  ev.beginPath();
  if (scope.sensor) ev.rect(cx - tw, cy - th, tw * 2, th * 2); else ev.arc(cx, cy, R, 0, Math.PI * 2);
  ev.fillStyle = `rgb(${lerp(3, 40, daylight)},${lerp(5, 70, daylight)},${lerp(12, 120, daylight)})`;
  ev.fill(); ev.clip();
  const plot = (dirW, draw) => {
    const d = dirW.clone().applyQuaternion(qInv);
    if (d.z <= Math.cos(half * 1.5)) return;
    // Inverted image, as through a real telescope: screen x follows +x, screen y follows +y.
    draw(cx + (d.x / d.z) * k, cy + (d.y / d.z) * k);
  };
  for (const [dir, mag, bv] of starDirs) plot(dir, (x, y) => {
    const c = bvColor(bv); ev.fillStyle = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`;
    ev.beginPath(); ev.arc(x, y, clamp(5.5 - mag * 0.75, 0.8, 6), 0, Math.PI * 2); ev.fill();
  });
  plot(sky.targetDirW, (x, y) => {
    ev.strokeStyle = 'rgba(224,184,102,0.9)'; ev.lineWidth = 1.5;
    ev.beginPath(); ev.arc(x, y, 9, 0, Math.PI * 2); ev.stroke();
  });
  const moonR = (0.26 * D2R) * k;
  plot(sky.moonDirW, (x, y) => { ev.fillStyle = '#d9d6cc'; ev.beginPath(); ev.arc(x, y, moonR, 0, Math.PI * 2); ev.fill(); });
  let sunInView = false;
  plot(sky.sunDirW, (x, y) => { sunInView = true; ev.fillStyle = '#fff6d0'; ev.beginPath(); ev.arc(x, y, moonR, 0, Math.PI * 2); ev.fill(); });
  ev.restore();
  ev.strokeStyle = '#59627a'; ev.lineWidth = 2;
  ev.beginPath();
  if (scope.sensor) ev.rect(cx - tw, cy - th, tw * 2, th * 2); else ev.arc(cx, cy, R, 0, Math.PI * 2);
  ev.stroke();
  $('eyeTitle').textContent = scope.sensor ? 'Camera view' : 'Eyepiece view';
  $('eyeCaption').textContent = scope.sensor
    ? `${fov[0].toFixed(2)}° × ${fov[1].toFixed(2)}° field · ${scope.focalLength.toFixed(0)} mm f/${(scope.focalLength / scope.aperture).toFixed(1)}`
    : `${scope.magnification.toFixed(0)}× with a 25 mm eyepiece · ${scope.trueField.toFixed(2)}° field`;
  $('sunWarn').hidden = !sunInView;
}

// ---------- readouts ----------
const fmtHM = (rad) => { let h = ((rad * R2D) / 15 + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m`; };
const fmtSignedHM = (rad) => { const s = rad < 0 ? '−' : '+'; let h = Math.abs(rad * R2D) / 15; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${s}${hh}h ${String(mm).padStart(2, '0')}m`; };
const fmtDeg = (rad, signed = false) => { const d = rad * R2D; return `${signed && d >= 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}°`; };
let lastReadout = 0;
function updateReadouts(now) {
  if (now - lastReadout < 120) return;
  lastReadout = now;
  const t = new Date(state.time);
  $('clock').textContent = t.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  $('lst').textContent = fmtHM(sky.h.lst);
  $('sunAlt').textContent = fmtDeg(sky.sunH.alt, true);
  const name = TARGETS[state.target][0];
  $('rTarget').textContent = name;
  $('rRa').textContent = fmtHM(sky.target.ra);
  $('rDec').textContent = fmtDeg(sky.target.dec, true);
  $('rHa').textContent = fmtSignedHM(sky.h.ha);
  $('rAlt').textContent = fmtDeg(sky.h.alt, true);
  $('rAz').textContent = `${(sky.h.az * R2D).toFixed(1)}° ${compassPoint(sky.h.az)}`;
  $('rHorizon').hidden = sky.h.alt > 0;
  const r = axisRates();
  const eq = state.mountMode === 'eq';
  $('axisAName').textContent = eq ? 'RA axis (turntable)' : 'Azimuth axis (turntable)';
  $('axisBName').textContent = eq ? 'Dec axis (arm)' : 'Altitude axis (arm)';
  $('axisARate').textContent = `${Math.abs(r.a).toFixed(1)}°/h`;
  $('axisBRate').textContent = `${Math.abs(r.b).toFixed(1)}°/h`;
  $('axisBBar').style.width = `${clamp(Math.abs(r.b) / 20 * 100, 0, 100)}%`;
  $('axisABar').style.width = `${clamp(Math.abs(r.a) / 20 * 100, 0, 100)}%`;
  const ang = sky.targetLocal ? Math.acos(clamp(sky.targetLocal.z, -1, 1)) * R2D : 0;
  $('offAxis').textContent = ang < 0.01 ? 'on axis' : ang < 1 ? `${(ang * 60).toFixed(1)}′ off axis` : `${ang.toFixed(1)}° off axis`;
  $('latLabel').textContent = `${Math.abs(state.lat * R2D).toFixed(1)}° ${state.lat >= 0 ? 'N' : 'S'}`;
}
const compassPoint = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((az * R2D) / 45) % 8];

const SCALE_NOTES = {
  solar: 'Not to scale. At true scale the Sun would be 12× smaller, Earth a speck 1/1000 of this size, and the Moon 4× farther out.',
  earth: 'The Moon is drawn 4× closer than its true 60 Earth radii. The celestial sphere has no real size: stars are effectively infinitely far away.',
  site: 'The telescope is drawn about 60× larger than true scale against the Earth, so the zoom stays smooth. Stars are at infinite distance.',
  optics: 'Optics to scale in millimetres. Rays are traced through one slice of the tube.',
};

// ---------- main loop ----------
let lastFrame = performance.now(), lastShown = -1;
function frame(now) {
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  state.time += dtReal * 1000 * state.speed;
  if (anim) {
    anim.t = Math.min(1, anim.t + dtReal / 1.6);
    const e = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - (-2 * anim.t + 2) ** 3 / 2;
    state.cam.L = lerp(anim.from.L, anim.to.L, e);
    state.cam.yaw = anim.from.yaw + wrapPi(anim.to.yaw - anim.from.yaw) * e;
    state.cam.pitch = lerp(anim.from.pitch, anim.to.pitch, e);
    if (anim.t >= 1) anim = null;
  }
  computeSky();
  const w = weights();

  // Bodies
  const earthPos = sky.sunDirW.clone().multiplyScalar(-ORBIT_R);
  earthSys.position.copy(earthPos);
  const exaggerate = 1 + 9 * smooth(w.L, 1.8, 2.7);
  earthSys.scale.setScalar(state.mode === 'eye' ? 1 : exaggerate);
  spin.rotation.y = sky.gmst;
  moon.position.copy(sky.moonDirW).multiplyScalar(MOON_ORBIT_R);
  moon.lookAt(earthPos);
  updateMoonOrbit();
  shellSun.position.copy(sky.sunDirW).multiplyScalar(SHELL_R);
  shellTarget.position.copy(vec(sphToVec(sky.target.ra, sky.target.dec)).multiplyScalar(SHELL_R));
  shellTarget.lookAt(V(0, 0, 0));

  // Site frame: x east, y up, z south.
  const up = vec(sphToVec(state.lon, state.lat));
  const north = V(-Math.sin(state.lat) * Math.cos(state.lon), Math.cos(state.lat), Math.sin(state.lat) * Math.sin(state.lon));
  const east = V().crossVectors(north, up);
  const basis = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  for (const g of [site, siteBig]) { g.position.copy(up); g.quaternion.setFromRotationMatrix(basis); }
  meridianShell.quaternion.setFromUnitVectors(V(1, 0, 0), V(up.x, 0, up.z).normalize());

  updateMount(dtReal);
  scene.updateMatrixWorld(true);
  placeCamera(w);
  bgCamera.quaternion.copy(camera.quaternion);
  bgCamera.fov = camera.fov;
  bgCamera.updateProjectionMatrix();
  camera.updateProjectionMatrix();

  // Background sky frames
  site.getWorldQuaternion(bgSite.quaternion);
  bgSunLight.position.copy(sky.sunDirW).multiplyScalar(SKY_R * 2);
  skySun.position.copy(sky.sunDirW).multiplyScalar(SKY_R * 0.97);
  skyMoon.position.copy(sky.moonDirW).multiplyScalar(SKY_R * 0.96);
  const upW = V(0, 1, 0).applyQuaternion(qSite);
  sky.upW = upW;
  const sunUp = sky.sunDirW.dot(upW);
  const daylight = w.site * smooth(Math.asin(clamp(sunUp, -1, 1)) * R2D, -12, 4);
  const L = state.layers;
  setAlpha(bgEqGrid, L.eq ? w.site : 0);
  setAlpha(bgEclLine, L.ecl ? Math.max(w.site, 0.35 * w.sol) : 0);
  setAlpha(altazGrid, L.hor ? w.site : 0);
  setAlpha(horizonLine, L.hor ? w.site : 0);
  setAlpha(meridianLine, L.mer ? w.site : 0);
  setAlpha(conLines, L.con ? lerp(0.6, 1, w.site) * (1 - 0.6 * daylight) : 0);
  bgStars.material.uniforms.alpha.value = 1 - 0.55 * daylight;
  bgStars.material.uniforms.scale.value = renderer.getPixelRatio() * (state.mode === 'eye' ? clamp(70 / state.eye.fov, 1, 3) : 1);
  shellStars.material.uniforms.scale.value = renderer.getPixelRatio();
  setAlpha(skySun, w.site);
  setAlpha(skyMoon, w.site);
  renderer.setClearColor(new THREE.Color(0x02030a).lerp(new THREE.Color(0x3d6fae), daylight));

  // Scene layer fades
  setAlpha(solarGroup, w.sol);
  setAlpha(eclPlane, L.ecl ? w.sol : 0);
  setAlpha(shellEq, L.eq ? w.earth : 0);
  setAlpha(shellPoles, L.eq ? w.earth : 0);
  setAlpha(shellEcl, L.ecl ? w.earth : 0);
  setAlpha(shellSun, w.earth);
  setAlpha(shellTarget, w.earth);
  shellStars.material.uniforms.alpha.value = w.earth;
  shellStars.visible = w.earth > 0.01;
  setAlpha(siteBig, L.hor ? w.earth : 0);
  setAlpha(sitePin, Math.max(w.earth, 0.001));
  if (moonOrbit) setAlpha(moonOrbit, L.moonOrbit ? Math.max(w.moon, w.sol * 0.8) : 0);
  setAlpha(axisLine, Math.max(w.earth, w.sol, w.moon) * 0.9);
  axisLine.scale.y = 1 + 2.5 * w.sol; // long enough to see its fixed direction around the orbit
  if (!meridianShell.children.length) {
    meridianShell.add(polyline(circle(SHELL_R * 1.002, 256, (t) => V(Math.cos(t), Math.sin(t), 0).multiplyScalar(SHELL_R * 1.002)), lineMat(COLORS.mer, 0.8)));
  }
  setAlpha(meridianShell, L.mer ? w.earth : 0);
  const seeThrough = L.ground && w.site > 0.5;
  ground.material.opacity = seeThrough ? 0.25 : 1;
  earthMat.opacity = seeThrough ? 0.2 : 1;
  earthMat.depthWrite = !seeThrough;
    site.visible = w.site > 0.01;
  const bodyAlpha = 1 - 0.85 * w.opt;
  for (const m of [...tubeMats, metal, dark]) { m.opacity = bodyAlpha; m.depthWrite = bodyAlpha > 0.9; }
  pointer.material.opacity = 0.55 * w.scope * (1 - w.opt);
  polarRod.material.opacity = state.mountMode === 'eq' ? 0.9 * w.scope : 0;
  sun.visible = sunGlow.visible = w.site < 0.99 || state.mode !== 'eye';

  // Starlight inside the telescope
  scopeGroup.getWorldQuaternion(qInv); qInv.invert();
  sky.targetLocal = sky.targetDirW.clone().applyQuaternion(qInv);
  setAlpha(scopeGroup.userData.ann, state.mode === 'eye' ? 0 : w.opt);
  updateRays(sky.targetLocal, (1 - smooth(w.L, LM + 0.8, LM + 1.4)) * (state.mode === 'eye' ? 0 : 1) * (sky.h.alt > 0 || L.ground ? 1 : 0.15));

  const W = canvas.clientWidth, H = canvas.clientHeight;
  renderer.clear();
  renderer.render(bgScene, bgCamera);
  renderer.clearDepth();
  renderer.render(scene, camera);
  updateLabels(W, H);
  drawEyeView(daylight);
  updateReadouts(now);

  // Scale ladder highlight and note
  const near = state.mode === 'eye' ? 'eye' : STOPS.reduce((b, s) => (Math.abs(s.L - w.L) < Math.abs(b.L - w.L) ? s : b)).id;
  if (near !== lastShown) {
    lastShown = near;
    document.querySelectorAll('#ladder button').forEach((b) => b.setAttribute('aria-current', b.dataset.stop === near ? 'true' : 'false'));
    const band = near === 'solar' ? 'solar' : near === 'moon' || near === 'earth' ? 'earth' : near === 'optics' || near === 'focus' ? 'optics' : 'site';
    $('scaleNote').textContent = SCALE_NOTES[band];
  }
  requestAnimationFrame(frame);
}

// ---------- labels: definitions ----------
const above = (dirW) => !(state.layers.ground) && sky.upW ? dirW.dot(sky.upW) > -0.02 : true;
const wNow = () => weights();
const solarLbl = (text, getPos) => label(text, 'l-solar', getPos, () => wNow().sol);
solarLbl('Sun', (v) => v.set(0, SUN_R * 1.3, 0));
solarLbl('Earth', (v) => v.copy(earthSys.position).add(V(0, 14, 0)));
solarLbl('Ecliptic plane (Earth’s orbit)', (v) => v.set(ORBIT_R * 0.72, 0, ORBIT_R * 0.72));
for (const m of seasonMarks) label(m.name, 'l-solar dim', (v) => v.copy(m.p).add(V(0, 6, 0)), () => wNow().sol);
label('Moon', 'l-moon', (v) => moon.getWorldPosition(v), () => { const w = wNow(); return Math.max(w.moon, w.earth * 0.8); });
label('North celestial pole', 'l-eq', (v) => tilt.localToWorld(v.set(0, SHELL_R * 1.05, 0)), () => (state.layers.eq ? wNow().earth : 0));
label('Celestial equator', 'l-eq', (v) => tilt.localToWorld(v.set(SHELL_R * 0.72, 0, SHELL_R * 0.72)), () => (state.layers.eq ? wNow().earth : 0));
label('Ecliptic', 'l-ecl', (v) => earthSys.localToWorld(v.copy(sky.sunDirW).applyAxisAngle(V(0, 1, 0), 1.2).multiplyScalar(SHELL_R)), () => (state.layers.ecl ? wNow().earth : 0));
label('Sun’s direction', 'l-sun', (v) => shellSun.getWorldPosition(v), () => wNow().earth * 0.8);
label('Earth’s axis', 'l-axis', (v) => tilt.localToWorld(v.set(0, 1.9, 0)), () => { const w = wNow(); return Math.max(w.earth, w.sol); });
label('You', 'l-brass', (v) => sitePin.getWorldPosition(v), () => { const w = wNow(); return Math.max(w.earth, w.moon) * 0.95; });
label('Your horizon', 'l-hor', (v) => siteBig.localToWorld(v.set(1.1, 0, 1.1)), () => (state.layers.hor ? wNow().earth : 0));
label('Meridian', 'l-mer', (v) => spin.localToWorld(v.copy(meridianShell.localToWorld(V(0, SHELL_R * 0.7, 0))).applyMatrix4(new THREE.Matrix4().copy(spin.matrixWorld).invert())), () => (state.layers.mer ? wNow().earth : 0));
label('Target', 'l-brass', (v) => shellTarget.getWorldPosition(v), () => wNow().earth);
// Sky (directions)
const skyLbl = (text, cls, dir, extra = () => 1) => label(text, cls, (v) => v.copy(dir()), () => (wNow().site > 0.5 && above(dir()) ? extra() : 0), { bg: true });
const siteDir = (x, y, z) => () => V(x, y, z).normalize().applyQuaternion(bgSite.quaternion);
for (const [n, x, z] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]) skyLbl(n, 'l-hor big', siteDir(x, 0.02, z), () => (state.layers.hor ? 1 : 0));
skyLbl('Zenith', 'l-hor', siteDir(0, 1, 0), () => (state.layers.hor ? 1 : 0));
skyLbl('Meridian', 'l-mer', siteDir(0, Math.sin(1.1), Math.cos(1.1)), () => (state.layers.mer ? 1 : 0));
skyLbl('North celestial pole', 'l-eq', () => V(0, 1, 0).applyQuaternion(eqToWorld), () => (state.layers.eq ? 1 : 0));
skyLbl('Celestial equator', 'l-eq', () => { const d = V(0, 0, 1).applyQuaternion(bgSite.quaternion); const e = V(0, 1, 0).applyQuaternion(eqToWorld); return d.sub(e.multiplyScalar(d.dot(e))).normalize(); }, () => (state.layers.eq ? 1 : 0));
skyLbl('Ecliptic', 'l-ecl', () => sky.sunDirW.clone().applyAxisAngle(V(0, 1, 0), Math.PI / 2), () => (state.layers.ecl ? 1 : 0));
skyLbl('Sun', 'l-sun', () => sky.sunDirW);
skyLbl('Moon', 'l-moon', () => sky.moonDirW);
skyLbl('', 'l-brass target', () => sky.targetDirW).classList.add('ring');
for (const [ra, dec, mag, name] of DATA.named) {
  if (mag > 1.6) continue;
  const d = vec(sphToVec(ra * D2R, dec * D2R)).applyQuaternion(eqToWorld);
  skyLbl(name, 'l-star', () => d, () => (state.layers.names ? 0.8 : 0));
}
for (const [ra, dec, name] of DATA.cnames) {
  const d = vec(sphToVec(ra * D2R, dec * D2R)).applyQuaternion(eqToWorld);
  skyLbl(name, 'l-con', () => d, () => (state.layers.con && state.layers.names ? 0.55 : 0));
}
const targetLbl = skyLbl('', 'l-brass tname', () => sky.targetDirW);
// Optics
const opticsLbl = (text, pos) => label(text, 'l-optics', (v) => scopeGroup.userData.optics.localToWorld(v.set(...pos())), () => wNow().opt * (state.mode === 'eye' ? 0 : 1));
opticsLbl('Starlight', () => [scope.aperture * 0.4, 0, scope.uAperture + 330]);
opticsLbl('Focus', () => [scope.focus[1], 0, scope.focus[0]]);
opticsLbl('Objective lens', () => (scope.lens ? [scope.aperture * 0.62, 0, scope.lens.top] : [0, 0, -1e5]));
opticsLbl('Primary mirror', () => (scope.mirrors ? [scope.mirrors[0].rMax * 0.8, 0, 8] : [0, 0, -1e5]));
opticsLbl('Secondary mirror', () => (scope.type === 'sct' ? [-34, 0, 325] : scope.diagonal ? [-40, 0, 590] : [0, 0, -1e5]));
opticsLbl('Corrector plate', () => (scope.corrector ? [-80, 0, 334] : [0, 0, -1e5]));
opticsLbl('Eyepiece', () => (scope.eyepiece ? [scope.eyepiece.c[1] + (scope.exitAxis[1] ? 10 : 22), 0, scope.eyepiece.c[0] + (scope.exitAxis[1] ? 40 : 0)] : [0, 0, -1e5]));
opticsLbl(() => (scope.sensor ? `Image sensor ${scope.sensor[0].toFixed(1)} × ${scope.sensor[1].toFixed(1)} mm` : ''), () => (scope.sensor ? [scope.sensor[0] / 2 + 10, 0, scope.focus[0] - 6] : [0, 0, -1e5]));
const fNum = () => (scope.focalLength / scope.aperture).toFixed(1);
const nominalF = () => (scope.sensor ? state.custom.focal : Math.round(scope.focalLength / 10) * 10);
const dimLbl = (text, pos) => label(text, 'l-dim', (v) => scopeGroup.userData.optics.localToWorld(v.set(...pos())), () => wNow().opt * (state.mode === 'eye' ? 0 : 1));
dimLbl(() => `Aperture ${scope.aperture} mm`, () => [scope.aperture / 2 + 8, 0, scope.uAperture + 14]);
dimLbl(() => `Focal length ${nominalF()} mm`, () => (scope.lens ? [-(scope.rTube + 12), 0, scope.focus[0] + scope.focalLength * 0.5] : [0, 0, -1e5]));
dimLbl(() => `f/${fNum()} = ${nominalF()} ÷ ${scope.aperture}`, () => (scope.exitAxis[1] ? [scope.focus[1], 0, scope.focus[0] - 90] : [scope.rTube * 0.7, 0, scope.focus[0] + Math.min(60, scope.focalLength * 0.15)]));
dimLbl(() => (scope.field ? `Field of view ${scope.field[0].toFixed(2)}° × ${scope.field[1].toFixed(2)}°` : ''), () => (scope.field ? [Math.max(scope.aperture / 2, 20) + 30, 0, scope.uAperture + 120] : [0, 0, -1e5]));

// ---------- interface ----------
function updateScopeUI() {
  const c = {
    seestar: ['ED doublet (corrects colour)', 'Swap in a single ordinary lens to see colour fringing'],
    refractor: ['Achromatic doublet', 'Swap in a single lens to see colour fringing'],
    newtonian: ['Parabolic mirror', 'Swap in a spherical mirror to see spherical aberration'],
    sct: ['Schmidt corrector plate', 'Remove the corrector to see spherical aberration'],
  }[state.telescope];
  $('corrLabel').textContent = c[0];
  $('corrHint').textContent = c[1];
  const F = nominalF(), D = scope.aperture, N = F / D;
  $('scopeFacts').textContent = `${scope.name} · ${D} mm aperture · ${F} mm focal length · f/${N.toFixed(1)}` +
    (scope.sensor ? ' · camera at the focus' : ` · 25 mm eyepiece gives ${scope.magnification.toFixed(0)}×`);
  const isCam = !!scope.sensor;
  $('lensSliders').hidden = $('resetLens').hidden = !isCam;
  const cone = 2 * Math.atan(1 / (2 * N)) * R2D;
  const seestarN = SEESTAR.focal / SEESTAR.aperture;
  const x = (v) => (v >= 10 ? v.toFixed(0) : v >= 0.95 ? v.toFixed(1) : v.toFixed(2));
  let html = `<p><b>f/${N.toFixed(1)}</b> is the <strong>focal ratio</strong>, or f-number: focal length ÷ aperture = ${F} mm ÷ ${D} mm. It sets how steep the cone of light is as it converges on the focus: here it is ${cone.toFixed(0)}° wide.</p>`;
  if (isCam) {
    const fov = scope.field, pixel = (206.265 * 2.9) / F;
    html += `<p>A smaller f-number means a fatter cone, so each pixel gets more light and a faint nebula needs less exposure. This setup needs <b>${x((N / seestarN) ** 2)}×</b> the Seestar S50 Pro’s exposure for the same nebula. Stars are points, so for them the aperture matters more than the f-number.</p>`
      + `<p><strong>Aperture</strong> sets how much light is collected in total, <b>${x((D / SEESTAR.aperture) ** 2)}×</b> the Seestar, and the finest detail the lens can separate: about <b>${(116 / D).toFixed(1)}″</b>.</p>`
      + `<p><strong>Focal length and sensor size</strong> set the field of view: <b>${fov[0].toFixed(2)}° × ${fov[1].toFixed(2)}°</b>. The full Moon is 0.5° across. Each 2.9 µm pixel covers <b>${pixel.toFixed(1)}″</b> of sky.</p>`;
  } else {
    html += `<p>With an eyepiece, the focal length sets the magnification (${F} mm ÷ 25 mm = <b>${scope.magnification.toFixed(0)}×</b>) and the aperture sets how faint you can see and how fine the detail: about <b>${(116 / D).toFixed(1)}″</b>.</p>`;
  }
  $('explain').innerHTML = html;
  $('focal').value = state.custom.focal; $('focalOut').textContent = `${state.custom.focal} mm`;
  $('aperture').max = Math.floor(state.custom.focal / 2.5);
  $('aperture').value = state.custom.aperture; $('apertureOut').textContent = `${state.custom.aperture} mm`;
  const diag = Math.hypot(...state.custom.sensor);
  $('sensorSize').value = diag.toFixed(1);
  $('sensorOut').textContent = `${diag.toFixed(1)} mm (${state.custom.sensor[0].toFixed(1)} × ${state.custom.sensor[1].toFixed(1)})`;
  $('sensorPreset').value = String(state.sensorPreset);
}
function setLens(changes) {
  Object.assign(state.custom, changes);
  state.custom.aperture = Math.min(state.custom.aperture, Math.floor(state.custom.focal / 2.5));
  buildScope();
  if (state.mode === 'orbit' && weights().opt > 0.5 && state.cam.L > LM - 1) goTo('optics'); // reframe the resized tube
}
function syncModeUI() {
  $('modeEye').setAttribute('aria-current', state.mode === 'eye' ? 'true' : 'false');
  canvas.classList.toggle('eye', state.mode === 'eye');
}
function syncControls() {
  $('speed').value = String(state.speed);
  $('target').value = String(state.target);
  for (const r of document.querySelectorAll('input[name=mount]')) r.checked = r.value === state.mountMode;
  for (const r of document.querySelectorAll('input[name=scope]')) r.checked = r.value === state.telescope;
  $('tracking').checked = state.tracking;
  $('corrected').checked = state.corrected;
  for (const [k, v] of Object.entries(state.layers)) { const el = $('ly-' + k); if (el) el.checked = v; }
  $('lat').value = (state.lat * R2D).toFixed(4);
  $('lon').value = (state.lon * R2D).toFixed(4);
  $('playPause').textContent = state.speed ? 'Pause' : 'Play';
  $('customBox').hidden = TARGETS[state.target][0] !== 'Custom';
}

function initUI() {
  $('speed').innerHTML = SPEEDS.map(([n, v]) => `<option value="${v}">${n}</option>`).join('');
  TARGETS.push(['Custom', null, null]);
  $('target').innerHTML = TARGETS.map(([n], i) => `<option value="${i}">${n === 'Custom' ? 'Custom RA/Dec…' : n}</option>`).join('');
  $('place').innerHTML = '<option value="">Choose a place…</option>' + PLACES.map(([n, la, lo], i) => `<option value="${i}">${n} (${la.toFixed(2)}, ${lo.toFixed(2)})</option>`).join('');
  $('ladder').insertAdjacentHTML('afterbegin', STOPS.map((s) => `<button type="button" data-stop="${s.id}"><span>${s.name}</span><small>${s.hint}</small></button>`).join(''));
  $('ladder').addEventListener('click', (e) => { const b = e.target.closest('button[data-stop]'); if (b) goTo(b.dataset.stop); });
  $('modeEye').addEventListener('click', () => (state.mode === 'eye' ? goTo('site') : standHere(0, 25)));
  $('speed').addEventListener('change', (e) => { state.speed = +e.target.value; syncControls(); });
  $('playPause').addEventListener('click', () => { state.speed = state.speed ? 0 : (state.lastSpeed || 60); if (state.speed) state.lastSpeed = state.speed; syncControls(); });
  $('now').addEventListener('click', () => { state.time = Date.now(); });
  $('setTime').addEventListener('change', (e) => { const t = Date.parse(e.target.value + 'Z'); if (!isNaN(t)) state.time = t; });
  $('target').addEventListener('change', (e) => { state.target = +e.target.value; slewing = true; syncControls(); });
  for (const id of ['customRa', 'customDec']) $(id).addEventListener('change', () => {
    state.customRa = clamp(parseFloat($('customRa').value) || 0, 0, 24) * 15 * D2R;
    state.customDec = clamp(parseFloat($('customDec').value) || 0, -90, 90) * D2R;
    slewing = true;
  });
  for (const r of document.querySelectorAll('input[name=mount]')) r.addEventListener('change', () => { state.mountMode = r.value; slewing = true; });
  for (const r of document.querySelectorAll('input[name=scope]')) r.addEventListener('change', () => { state.telescope = r.value; buildScope(); });
  $('tracking').addEventListener('change', (e) => { state.tracking = e.target.checked; if (state.tracking) slewing = true; });
  $('corrected').addEventListener('change', (e) => { state.corrected = e.target.checked; buildScope(); });
  for (const k of Object.keys(state.layers)) $('ly-' + k)?.addEventListener('change', (e) => { state.layers[k] = e.target.checked; });
  const setLoc = (la, lo) => { state.lat = clamp(la, -89.99, 89.99) * D2R; state.lon = lo * D2R; slewing = true; syncControls(); };
  $('lat').addEventListener('change', () => setLoc(parseFloat($('lat').value) || 0, state.lon * R2D));
  $('lon').addEventListener('change', () => setLoc(state.lat * R2D, parseFloat($('lon').value) || 0));
  $('place').addEventListener('change', (e) => { const p = PLACES[+e.target.value]; if (p) setLoc(p[1], p[2]); e.target.value = ''; });
  for (const b of document.querySelectorAll('[role=tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('prev').addEventListener('click', () => showLesson(state.lesson - 1));
  $('next').addEventListener('click', () => showLesson(state.lesson + 1));
  $('replay').addEventListener('click', () => showLesson(state.lesson));
  $('panelToggle').addEventListener('click', () => document.body.classList.toggle('panel-closed'));
  $('sensorPreset').innerHTML = SENSORS.map(([n, a, b], i) => `<option value="${i}">${n}: ${a} × ${b} mm</option>`).join('');
  $('focal').addEventListener('input', (e) => setLens({ focal: +e.target.value }));
  $('aperture').addEventListener('input', (e) => setLens({ aperture: +e.target.value }));
  $('sensorPreset').addEventListener('change', (e) => { state.sensorPreset = +e.target.value; const s = SENSORS[state.sensorPreset]; setLens({ sensor: [s[1], s[2]] }); });
  $('sensorSize').addEventListener('input', (e) => {
    const s = SENSORS[state.sensorPreset], k = +e.target.value / Math.hypot(s[1], s[2]);
    setLens({ sensor: [s[1] * k, s[2] * k] });
  });
  $('resetLens').addEventListener('click', () => { state.sensorPreset = 0; setLens({ ...SEESTAR }); });
  initPointer();
  syncControls();
}
function showTab(id) {
  for (const b of document.querySelectorAll('[role=tab]')) b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false');
  for (const p of document.querySelectorAll('[role=tabpanel]')) p.hidden = p.id !== 'tab-' + id;
}

// Drag to orbit (or look around), wheel or pinch to zoom.
function initPointer() {
  const pts = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); anim = null; });
  canvas.addEventListener('pointerup', (e) => { pts.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const [x0, y0] = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomBy((pinch - dist) * 0.006);
      pinch = dist;
      return;
    }
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (state.mode === 'eye') {
      const k = state.eye.fov / canvas.clientHeight * D2R;
      state.eye.yaw += dx * k; state.eye.pitch = clamp(state.eye.pitch + dy * k, -0.3, 1.55);
    } else {
      state.cam.yaw -= dx * 0.006; state.cam.pitch = clamp(state.cam.pitch + dy * 0.006, -1.5, 1.5);
    }
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); anim = null; zoomBy(e.deltaY * (e.deltaMode ? 0.05 : 0.0016)); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
    if (k) { state.cam.yaw += k[0]; state.cam.pitch = clamp(state.cam.pitch + k[1], -1.5, 1.5); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') zoomBy(-0.15);
    if (e.key === '-') zoomBy(0.15);
  });
}
function zoomBy(dL) {
  if (state.mode === 'eye') state.eye.fov = clamp(state.eye.fov * 10 ** dL, 4, 110);
  else state.cam.L = clamp(state.cam.L + dL, LM - 2.8, 3.3);
}

// Centre the scene in the part of the screen the panels leave uncovered.
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = bgCamera.aspect = w / h;
  const panel = $('panel').getBoundingClientRect(), ladder = $('ladder').getBoundingClientRect();
  let dx = 0, dy = 0;
  if (innerWidth > 860) dx = (panel.right - (w - ladder.left)) / 2;
  else dy = (h - panel.top - $('timebar').getBoundingClientRect().bottom) / 2;
  for (const c of [camera, bgCamera]) c.setViewOffset(w, h, -dx, dy, w, h);
}
new ResizeObserver(resize).observe(canvas);
new ResizeObserver(resize).observe($('panel'));

// ---------- lessons ----------
// Each lesson sets up the scene, then explains what to watch.
const LESSONS = [
  {
    title: 'Earth goes round the Sun', stop: 'solar', speed: 604800, layers: { ecl: true, moonOrbit: false },
    body: `<p>Earth takes a year to go once around the Sun. The flat plane of that orbit is the <b class="c-ecl">ecliptic plane</b>. All the planets orbit close to it, so it is the main reference plane of the solar system.</p><p>Time is running at one week per second. Drag to look around; scroll or pinch to zoom.</p>`,
  },
  {
    title: 'A tilted axis that keeps its direction', stop: 'solar', speed: 604800, layers: { ecl: true }, yaw: 0.2, pitch: 12,
    body: `<p>Earth spins around an <b>axis</b> tilted 23.4° from upright, relative to the ecliptic. The axis keeps pointing the same way in space all year, at a spot very close to Polaris.</p><p>Around the <b>June solstice</b> the north end leans toward the Sun: northern summer. Six months later it leans away. At the two <b>equinoxes</b> it leans sideways and day and night are equal everywhere.</p>`,
  },
  {
    title: 'The Moon', stop: 'moon', speed: 86400, layers: { moonOrbit: true, eq: false },
    body: `<p>The <b class="c-moon">Moon</b> orbits Earth every 27.3 days, in the same direction that Earth spins. Its orbit is tilted about 5° to the ecliptic, which is why we don’t get an eclipse every month.</p><p>The Moon turns exactly once per orbit, so the same face (with its dark patches) always points at Earth. The Sun always lights half of it; the <b>phase</b> is how much of that lit half faces us.</p>`,
  },
  {
    title: 'Earth spins under the sky', stop: 'earth', speed: 3600, layers: { eq: false, ecl: false, mer: false, hor: true },
    body: `<p>Earth turns once on its axis relative to the stars every <b>23 h 56 min</b> (a sidereal day). Relative to the Sun it takes 24 h, because Earth also moves a little along its orbit each day and has to turn a bit further to face the Sun again.</p><p>The gold dot is you, with your <b class="c-hor">horizon</b> drawn as a flat green plane. Earth turns west to east, so the whole sky appears to turn east to west.</p>`,
  },
  {
    title: 'The celestial sphere', stop: 'earth', speed: 3600, layers: { eq: true, ecl: false, mer: false, hor: true },
    body: `<p>Stars are so far away that they all look like points on a huge sphere centred on Earth. Extend Earth’s axis out to it and you get the <b class="c-eq">celestial poles</b>. Extend the equator and you get the <b class="c-eq">celestial equator</b>.</p><p>The blue grid is the <b>equatorial coordinate system</b>. <b>Declination</b> (Dec) is latitude on the sky: +90° at the north celestial pole. <b>Right ascension</b> (RA) is longitude on the sky, counted in hours (0–24 h) eastward from the point where the Sun crosses the equator in March.</p><p>This grid is fixed to the stars, not to Earth. Earth turns inside it, so a star’s RA and Dec stay the same all night and all year.</p>`,
  },
  {
    title: 'The ecliptic on the sky', stop: 'earth', speed: 86400, layers: { eq: true, ecl: true, mer: false },
    body: `<p>Seen from Earth, the Sun creeps once around the sky each year against the background stars. Its path is the <b class="c-ecl">ecliptic</b>: the ecliptic plane seen edge-on from inside.</p><p>It is tilted 23.4° to the celestial equator, for the same reason Earth’s axis is tilted. The Sun crosses the equator at the March and September equinoxes. The Moon and planets always stay close to the ecliptic.</p>`,
  },
  {
    title: 'Your horizon: altitude and azimuth', stop: 'site', speed: 600, layers: { eq: false, ecl: false, hor: true, mer: false }, yaw: 0.5,
    body: `<p>Zoom in to your site and Earth looks flat. You can only see the half of the sky above your <b class="c-hor">horizon</b>.</p><p><b>Altitude</b> is the angle above the horizon: 0° at the horizon, 90° straight up at the <b>zenith</b>. <b>Azimuth</b> is the compass bearing, measured from north through east: 90° is east, 180° south, 270° west.</p><p>The green grid is this <b>alt-az</b> system. It is fixed to you, not the stars, so a star’s altitude and azimuth keep changing through the night. Watch the numbers at the bottom of the screen.</p>`,
  },
  {
    title: 'The meridian', eye: [0, 28], speed: 600, layers: { eq: false, ecl: true, hor: true, mer: true },
    body: `<p>You are now standing next to the telescope, facing south. The pink <b class="c-mer">meridian</b> runs from due north on the horizon, up through the zenith, and down to due south.</p><p>Every star crosses it once a day. At that moment it <b>transits</b>: it is at its highest. The <b>hour angle</b> (HA) is how long ago a star crossed the meridian. <b>Local sidereal time</b> (LST) is the RA that is on the meridian right now, so HA = LST − RA.</p><p>Drag to look around; scroll to zoom.</p>`,
  },
  {
    title: 'The sky turns around the pole', eye: [180, 35], speed: 3600, target: 'Polaris', layers: { eq: true, ecl: false, hor: true, mer: true, con: true },
    body: `<p>Face north and the sky turns around the <b class="c-eq">north celestial pole</b>, less than a degree from Polaris. The pole’s altitude always equals your latitude: <b id="lessonLat"></b> here.</p><p>Stars closer to the pole than that never set. They are <b>circumpolar</b>. Change your latitude under Controls to see the effect: at the equator the pole sits on the horizon, and at the North Pole it is overhead.</p>`,
  },
  {
    title: 'The Seestar in alt-az mode', stop: 'scope', speed: 600, mount: 'altaz', target: 'Vega', tracking: true, layers: { hor: true, eq: false, mer: true },
    body: `<p>Out of the box, the <b>Seestar S50 Pro</b> is an <b>alt-azimuth</b> mount: the turntable swings it around the horizon (azimuth) and the arm tilts it up and down (altitude).</p><p>To follow a star, both axes must move, at speeds that keep changing. Compare the two axis speeds under Controls. The picture in the camera also slowly rotates (<b>field rotation</b>), which is why alt-az mode limits how long each exposure can be.</p>`,
  },
  {
    title: 'Equatorial mode', stop: 'scope', speed: 600, mount: 'eq', target: 'Vega', tracking: true, layers: { hor: true, eq: true, mer: true },
    body: `<p>Tilt the whole Seestar on a wedge so its turntable axis is <b>parallel to Earth’s axis</b>, pointing at the celestial pole. The tilt from vertical is 90° minus your latitude, so the axis rises at an angle equal to your latitude.</p><p>Now the turntable is the <b>RA axis</b> and the arm is the <b>Dec axis</b>. To follow a star, only the RA axis turns, at a steady 15° per hour (one turn per sidereal day), undoing Earth’s spin. The Dec axis stays still and the field no longer rotates. That is <b>equatorial mode</b>.</p>`,
  },
  {
    title: 'What tracking does', stop: 'optics', speed: 60, mount: 'eq', tracking: false, target: 'Vega',
    body: `<p>Tracking is now off. As Earth turns, the star drifts out of the field: about a quarter of a degree per minute near the celestial equator, less near the pole.</p><p>Inside the tube, watch the starlight come in at a growing angle and its focus slide sideways across the camera sensor. Tick <b>Track the target</b> under Controls to bring it back.</p>`,
  },
  {
    title: 'Inside the Seestar', stop: 'optics', speed: 1, telescope: 'seestar', corrected: true, tracking: true,
    body: `<p>The Seestar is a small <b>refractor</b>: a 50 mm lens at the front bends starlight to a focus 260 mm behind it, right on a camera sensor. There is no eyepiece; you see the sensor’s image on your phone.</p><p>Glass bends blue light more than red, so a single lens focuses each colour at a different distance. Two lenses made of different glasses, one of them extra-low-dispersion (ED) glass, can cancel that. Untick the lens option under Controls, then zoom in to the focus to see the colours split. ZWO’s real lens has four elements; this model uses two with the same focal length.</p>`,
  },
  {
    title: 'Aperture, focal length and f-number', stop: 'optics', speed: 1, telescope: 'seestar', corrected: true, tracking: true,
    body: `<p>Three numbers describe the Seestar’s optics, and all three are drawn in gold on the tube.</p><p><b>Aperture</b> (50 mm) is the diameter of the lens: the size of the bucket catching light. <b>Focal length</b> (260 mm) is how far behind the lens the light comes to a focus. The <b>image sensor</b> sits exactly there.</p><p>The <b>f-number</b> is simply focal length ÷ aperture: 260 ÷ 50 = f/5.2. It describes the shape of the cone of light: a low f-number is a short, fat cone that pours more light onto each pixel.</p><p>Open the Telescope tab and drag the sliders and watch the cone, the field of view (dashed purple) and the camera view change.</p>`,
  },
  {
    title: 'Zoom in on the focus', stop: 'focus', speed: 1, telescope: 'seestar', corrected: false, tracking: true,
    body: `<p>This is the region around the focus, a few millimetres across. With a single plain lens, blue rays (bent most) cross the axis first and red rays last: <b>chromatic aberration</b>. Stars get coloured halos.</p><p>Tick the ED doublet under Controls and the colours land together on the sensor.</p>`,
  },
  {
    title: 'Other designs: Newtonian reflector', stop: 'optics', speed: 1, telescope: 'newtonian', corrected: true, tracking: true,
    body: `<p>A <b>Newtonian</b> collects light with a curved mirror at the bottom of the tube. A small flat mirror at 45° near the top sends the converging light out of the side to an eyepiece. Mirrors reflect every colour the same way, so there is no colour fringing.</p><p>The main mirror must be a <b>paraboloid</b>. Untick it under Controls to use a cheaper spherical mirror: the outer rays then focus short of the inner ones (<b>spherical aberration</b>).</p>`,
  },
  {
    title: 'Other designs: Schmidt-Cassegrain', stop: 'optics', speed: 1, telescope: 'sct', corrected: true, tracking: true,
    body: `<p>A <b>Schmidt-Cassegrain</b> folds a long focal length into a short tube. Light passes a thin <b>corrector plate</b>, bounces off a spherical main mirror, then off a small convex mirror that sends it back through a hole in the main mirror. The small mirror stretches the focal length about five times.</p><p>Spherical mirrors are easy to make but blur the focus. The corrector plate’s subtle shape pre-bends each ray so they all meet. Untick it to see the blur.</p>`,
  },
  {
    title: 'The eyepiece and magnification', stop: 'optics', speed: 1, telescope: 'refractor', corrected: true, tracking: true,
    body: `<p>Visual telescopes end in an <b>eyepiece</b>: a small magnifier that turns the converging light back into a parallel beam for your eye.</p><p>Magnification = telescope focal length ÷ eyepiece focal length. With the same 25 mm eyepiece this 600 mm refractor gives 24×, and the 2000 mm Schmidt-Cassegrain 80×. More magnification means a smaller patch of sky: compare the eyepiece view for each design.</p><p>To finish, pick the Seestar again under Controls and explore freely.</p>`,
  },
];

function showLesson(i) {
  i = clamp(i, 0, LESSONS.length - 1);
  state.lesson = i;
  const l = LESSONS[i];
  if (l.speed !== undefined) state.speed = l.speed;
  if (l.layers) Object.assign(state.layers, l.layers);
  if (l.mount) state.mountMode = l.mount;
  if (l.tracking !== undefined) state.tracking = l.tracking;
  if (l.target) { state.target = TARGETS.findIndex((t) => t[0] === l.target); }
  if (l.telescope || l.corrected !== undefined) {
    state.telescope = l.telescope ?? state.telescope; state.corrected = l.corrected ?? state.corrected;
    buildScope();
  }
  slewing = true;
  if (l.eye) standHere(...l.eye); else goTo(l.stop, { yaw: l.yaw, pitch: l.pitch });
  $('lessonStep').textContent = `${i + 1} of ${LESSONS.length}`;
  $('lessonTitle').textContent = l.title;
  $('lessonBody').innerHTML = l.body;
  const latEl = $('lessonLat');
  if (latEl) latEl.textContent = `${Math.abs(state.lat * R2D).toFixed(1)}°`;
  $('prev').disabled = i === 0;
  $('next').disabled = i === LESSONS.length - 1;
  syncControls();
}

// ---------- start ----------
initUI();
buildScope();
// A link ending #lesson5 opens that lesson directly.
const startLesson = /^#lesson(\d+)$/.exec(location.hash);
showLesson(startLesson ? +startLesson[1] - 1 : 0);
if (!startLesson) state.cam = { L: 2.85, yaw: 0.6, pitch: 28 * D2R };
else if (anim) anim.t = 0.999;
requestAnimationFrame(frame);
