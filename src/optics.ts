// 2D ray tracer for a slice through a telescope. Units are millimetres.
// u runs along the tube axis (positive toward the sky), v across it. Light from a star travels toward -u.
export const EYEPIECE_FL = 25;
export const EYEPIECE_AFOV = 52;

export type Vec2 = [number, number];
export type Wave = 'r' | 'g' | 'b';
type Glass = 'BK7' | 'F2' | 'FPL53';

// Refractive indices at the C (red), d (yellow) and F (blue) lines.
const GLASS: Record<Glass, Record<Wave, number>> = {
  BK7: { r: 1.51432, g: 1.5168, b: 1.52238 },
  F2: { r: 1.61503, g: 1.62004, b: 1.63208 },
  FPL53: { r: 1.43733, g: 1.43875, b: 1.44195 }, // ED (extra-low dispersion) fluorophosphate crown
};

// Seestar S50 Pro telephoto camera: 3840 x 2160 pixels of 2.9 um (ZWO quotes a 2.8 degree diagonal field).
export const SEESTAR_SENSOR_MM: Vec2 = [6.264, 11.136];
const APSC_SENSOR_MM: Vec2 = [15.6, 23.5];
const index = (glass: Glass | null, wave: Wave) => (glass ? GLASS[glass][wave] : 1);

// Conic of revolution with its vertex at u0: v^2 - 2R x + (1+k) x^2 = 0, x = u - u0, centre of curvature at x = R.
// k = 0 is a sphere, -1 a paraboloid, < -1 a hyperboloid. R = Infinity is a flat.
export interface Conic {
  type: 'conic'; mode: 'mirror' | 'refract'; u0: number; R: number; k: number; rMax: number; rMin?: number;
  facing?: 1 | -1; above?: Glass | null; below?: Glass | null;
}
// Plane through c with unit normal n, limited to `half` either side of c.
export interface Plane { type: 'plane'; mode: 'mirror' | 'absorb' | 'lens'; c: Vec2; n: Vec2; half: number; f?: number }
export interface Corrector { type: 'corrector'; mode: 'bend'; u0: number; half: number; delta: (y: number) => number }
export type Surface = Conic | Plane | Corrector;
export type TelescopeType = 'seestar' | 'refractor' | 'newtonian' | 'sct' | 'petzval';
export interface CameraSpec { focal: number; aperture: number; sensor: Vec2 }

export interface Telescope {
  type: TelescopeType; corrected: boolean; name: string; waves: Wave[];
  aperture: number; rTube: number; u0: number; u1: number; color: number; box?: Vec2;
  optics: Surface[]; surfaces: Surface[]; exitAxis: Vec2; uAperture: number;
  lens?: { top: number; surfaces: Conic[] };
  mirrors?: Conic[]; diagonal?: Plane; corrector?: Corrector;
  focuser?: { c: Vec2; axis: Vec2; r: number; len: number };
  focus: Vec2; focalLength: number;
  sensor?: Vec2; field?: Vec2; eyepiece?: Plane; magnification?: number; trueField?: number;
  seestarBody?: boolean;
}
export interface Ray { wave: Wave; pts: Vec2[]; alive: boolean }

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const norm = ([x, y]: Vec2): Vec2 => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const reflect = (d: Vec2, n: Vec2): Vec2 => { const k = 2 * dot(d, n); return [d[0] - k * n[0], d[1] - k * n[1]]; };

function refract(d: Vec2, n: Vec2, n1: number, n2: number): Vec2 {
  if (dot(d, n) > 0) n = [-n[0], -n[1]];
  const eta = n1 / n2, cosi = -dot(n, d), k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return reflect(d, n);
  const c = eta * cosi - Math.sqrt(k);
  return norm([eta * d[0] + c * n[0], eta * d[1] + c * n[1]]);
}

interface Hit { t: number; n: Vec2; y?: number }

function hitConic(s: Conic, p: Vec2, d: Vec2): Hit | null {
  const px = p[0] - s.u0, py = p[1], [dx, dy] = d;
  let ts: number[];
  if (!isFinite(s.R)) ts = Math.abs(dx) < 1e-12 ? [] : [-px / dx];
  else {
    const k1 = 1 + s.k;
    const a = dy * dy + k1 * dx * dx, b = 2 * py * dy - 2 * s.R * dx + 2 * k1 * px * dx, c = py * py - 2 * s.R * px + k1 * px * px;
    if (Math.abs(a) < 1e-12) ts = [-c / b];
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const q = Math.sqrt(disc);
      ts = [(-b - q) / (2 * a), (-b + q) / (2 * a)];
    }
  }
  let best: { t: number; x: number; y: number } | null = null;
  for (const t of ts) {
    if (!(t > 1e-7)) continue;
    const x = px + t * dx, y = Math.abs(py + t * dy);
    if (y > s.rMax || y < (s.rMin || 0)) continue;
    if (isFinite(s.R) && Math.abs(x) > Math.abs(s.R)) continue; // far side of a sphere
    if (!best || t < best.t) best = { t, x, y: py + t * dy };
  }
  if (!best) return null;
  const n: Vec2 = isFinite(s.R) ? norm([-2 * s.R + 2 * (1 + s.k) * best.x, 2 * best.y]) : [1, 0];
  return { t: best.t, n };
}

function hitPlane(c: Vec2, n: Vec2, half: number, p: Vec2, d: Vec2): Hit | null {
  const den = dot(d, n);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - p[0]) * n[0] + (c[1] - p[1]) * n[1]) / den;
  if (!(t > 1e-7)) return null;
  const q = [p[0] + t * d[0], p[1] + t * d[1]];
  const y = (q[0] - c[0]) * -n[1] + (q[1] - c[1]) * n[0];
  return Math.abs(y) > half ? null : { t, n, y };
}

function hit(s: Surface, p: Vec2, d: Vec2): Hit | null {
  switch (s.type) {
    case 'conic': return hitConic(s, p, d);
    case 'plane': return hitPlane(s.c, s.n, s.half, p, d);
    case 'corrector': return d[0] < 0 ? hitPlane([s.u0, 0], [1, 0], s.half, p, d) : null;
  }
}

// New direction after the surface, or null if the light is absorbed there.
function interact(s: Surface, h: Hit, d: Vec2, wave: Wave): Vec2 | null {
  if (s.type === 'corrector') return norm([-1, d[1] / -d[0] + s.delta(h.y ?? 0)]);
  if (s.mode === 'absorb') return null;
  if (s.mode === 'mirror') {
    // Mirrors only reflect on their silvered side; light arriving at the back is blocked.
    const front = s.type === 'conic' ? d[0] * (s.facing ?? 1) < 0 : dot(d, s.n) < 0;
    return front ? reflect(d, h.n) : null;
  }
  if (s.type === 'conic') {
    const below = d[0] < 0;
    return refract(d, h.n, index((below ? s.above : s.below) ?? null, wave), index((below ? s.below : s.above) ?? null, wave));
  }
  // A thin lens bends a ray by changing its slope relative to the lens axis.
  const a = s.n, perp: Vec2 = [-a[1], a[0]], along = dot(d, a);
  if (along <= 0) return d;
  const slope = dot(d, perp) / along - (h.y ?? 0) / (s.f ?? Infinity);
  return norm([a[0] + slope * perp[0], a[1] + slope * perp[1]]);
}

export function trace(surfaces: Surface[], p: Vec2, d: Vec2, wave: Wave = 'g', tail = 150): { pts: Vec2[]; d: Vec2; alive: boolean } {
  const pts: Vec2[] = [p];
  for (let i = 0; i < 20; i++) {
    let best: Hit | null = null, bs: Surface | null = null;
    for (const s of surfaces) {
      const h = hit(s, p, d);
      if (h && (!best || h.t < best.t)) { best = h; bs = s; }
    }
    if (!best || !bs) { pts.push([p[0] + d[0] * tail, p[1] + d[1] * tail]); return { pts, d, alive: true }; }
    p = [p[0] + d[0] * best.t, p[1] + d[1] * best.t];
    pts.push(p);
    const nd = interact(bs, best, d, wave);
    if (!nd) return { pts, d, alive: false };
    d = nd;
  }
  return { pts, d, alive: false };
}

// Where a ray leaving through `surfaces` crosses the line through `o` with direction `axis`.
function crossing(surfaces: Surface[], p: Vec2, d: Vec2, o: Vec2, axis: Vec2, wave: Wave = 'g') {
  const r = trace(surfaces, p, d, wave);
  const a = r.pts[r.pts.length - 2], b = r.pts[r.pts.length - 1], dir = norm([b[0] - a[0], b[1] - a[1]]);
  const perp: Vec2 = [-axis[1], axis[0]];
  const t = -dot([a[0] - o[0], a[1] - o[1]], perp) / dot(dir, perp);
  return { at: [a[0] + dir[0] * t, a[1] + dir[1] * t] as Vec2, dir };
}

// Lens elements from the sky end down: each sets the radius of a surface, the glass below it and the gap to the next.
interface Elem { R: number; glass: Glass | null; gap: number; rMax: number }
function lensSurfaces(u0: number, elems: Elem[]): Conic[] {
  let u = u0, above: Glass | null = null;
  return elems.map((e) => {
    const s: Conic = { type: 'conic', mode: 'refract', u0: u, R: e.R, k: 0, rMax: e.rMax, above, below: e.glass };
    above = e.glass; u -= e.gap;
    return s;
  });
}

const wall = (u0: number, u1: number, v: number): Plane => ({ type: 'plane', mode: 'absorb', c: [(u0 + u1) / 2, v], n: [0, 1], half: (u1 - u0) / 2 });
const walls = (u0: number, u1: number, r: number) => [wall(u0, u1, r), wall(u0, u1, -r)];

export const SEESTAR: CameraSpec = { focal: 260, aperture: 50, sensor: SEESTAR_SENSOR_MM };
const sag = (R: number, r: number) => Math.abs(R) - Math.sqrt(R * R - r * r);

// Cemented achromat: crown (BK7) positive element and flint (F2) negative one, f = 600 mm at scale 1,
// bent for minimum spherical aberration (searched with this tracer).
const achromat = (k: number, rMax: number, last: number): Elem[] => [
  { R: -277.986 * k, glass: 'BK7', gap: 9 * k, rMax }, { R: 259.695 * k, glass: 'F2', gap: 4 * k, rMax }, { R: 3036.94 * k, glass: null, gap: last, rMax },
];
const singlet = (f: number, rMax: number, last: number): Elem[] => {
  const R = 2 * (GLASS.BK7.g - 1) * f;
  return [{ R: -R, glass: 'BK7', gap: 2 * sag(R, rMax) + 2, rMax }, { R, glass: null, gap: last, rMax }];
};

// A telescope before its focus has been found.
type Draft = Omit<Telescope, 'focus' | 'focalLength'>;

// Lens for the Seestar-style camera refractor at any focal length, aperture and sensor size.
// ZWO's lens is a four-element ED apochromat whose prescription isn't published; this stands in an
// air-spaced ED doublet bent for minimum spherical aberration at 260 mm (searched with this tracer),
// scaled to the requested focal length. Thicknesses grow so the glass keeps a real edge.
function cameraRefractor(corrected: boolean, { focal, aperture, sensor }: CameraSpec): Draft {
  const k = focal / 260, r = aperture / 2;
  const isSeestar = focal === SEESTAR.focal && aperture === SEESTAR.aperture;
  let elems: Elem[];
  if (corrected) {
    const [R1, R2, R3, R4] = [-113.884, 184.209, 153.984, 378.464].map((x) => x * k);
    const t1 = Math.max(7 * k, sag(R1, r) + sag(R2, r) + 1.5);
    const gap = Math.max(1 * k, sag(R3, r) - sag(R2, r) + 0.4);
    elems = [{ R: R1, glass: 'FPL53', gap: t1, rMax: r + 1 }, { R: R2, glass: null, gap, rMax: r + 1 },
      { R: R3, glass: 'F2', gap: Math.max(3 * k, 2), rMax: r + 1 }, { R: R4, glass: null, gap: 0, rMax: r + 1 }];
  } else elems = singlet(focal, r + 1, 0);
  const top = focal + 4;
  const optics = lensSurfaces(top, elems);
  return {
    type: 'seestar', corrected, name: isSeestar ? 'Seestar S50 Pro' : 'Custom camera refractor', waves: ['r', 'g', 'b'],
    aperture, rTube: Math.max(60, r + 12), u0: 0, u1: 0, color: 0x3a3f4a, box: [Math.max(120, aperture + 40), Math.max(140, aperture + 50)],
    optics, surfaces: [...optics], exitAxis: [-1, 0], uAperture: top, lens: { top, surfaces: optics }, sensor, seestarBody: isSeestar,
  };
}

// Builds a telescope. `corrected` switches on the part that removes the design's main aberration.
// `custom` sets focal length, aperture and sensor size for the Seestar-style camera refractor.
export function makeTelescope(type: TelescopeType, corrected: boolean, custom: CameraSpec = SEESTAR): Telescope {
  let t: Draft;
  if (type === 'seestar') t = cameraRefractor(corrected, custom);
  else if (type === 'refractor') {
    const optics = lensSurfaces(640, corrected ? achromat(1, 41, 0) : singlet(600, 41, 0));
    t = {
      type, corrected, name: 'Refractor', waves: ['r', 'g', 'b'], aperture: 80, rTube: 48, u0: 70, u1: 735, color: 0xe8e6df,
      optics, surfaces: [...optics, ...walls(70, 735, 48)], exitAxis: [-1, 0], uAperture: 640, lens: { top: 640, surfaces: optics },
    };
  } else if (type === 'petzval') {
    // Petzval astrograph: a front achromat (f 600 mm) and a rear achromat (f 700 mm) 250 mm behind it.
    // The rear group shortens the focal length to about 400 mm (f/5) and flattens the field for a camera.
    const front = corrected ? achromat(1, 41, 250) : singlet(600, 41, 250);
    const rear = corrected ? achromat(700 / 600, 30, 0).map((e, i) => ({ ...e, gap: i === 2 ? 0 : e.gap * 0.78 })) : singlet(700, 30, 0);
    const optics = lensSurfaces(500, [...front, ...rear]);
    t = {
      type, corrected, name: 'Petzval astrograph', waves: ['r', 'g', 'b'], aperture: 80, rTube: 50, u0: 0, u1: 0, color: 0xd9dde6,
      optics, surfaces: [...optics], exitAxis: [-1, 0], uAperture: 500, lens: { top: 500, surfaces: optics }, sensor: APSC_SENSOR_MM,
    };
  } else if (type === 'newtonian') {
    const primary: Conic = { type: 'conic', mode: 'mirror', facing: 1, u0: 0, R: 1500, k: corrected ? -1 : 0, rMax: 75 };
    const diag: Plane = { type: 'plane', mode: 'mirror', c: [650, 0], n: norm([-1, 1]), half: 24 };
    t = {
      type, corrected, name: 'Newtonian reflector', waves: ['g'], aperture: 150, rTube: 90, u0: -30, u1: 820, color: 0x1b1e26,
      optics: [primary, diag], mirrors: [primary], diagonal: diag, exitAxis: [0, 1], uAperture: 820,
      surfaces: [primary, diag, wall(-30, 622, 90), wall(678, 820, 90), wall(-30, 820, -90)],
      focuser: { c: [650, 90], axis: [0, 1], r: 20, len: 30 },
    };
  } else {
    const primary: Conic = { type: 'conic', mode: 'mirror', facing: 1, u0: 0, R: 800, k: 0, rMax: 101.5, rMin: 32 };
    const secondary: Conic = { type: 'conic', mode: 'mirror', facing: -1, u0: 313.3, R: 216.7, k: 0, rMax: 34 };
    const corrector: Corrector = { type: 'corrector', mode: 'bend', u0: 322, half: 101.5, delta: schmidtProfile(primary, secondary, 322) };
    const optics = [corrected ? corrector : { ...corrector, delta: () => 0 }, primary, secondary];
    t = {
      type, corrected, name: 'Schmidt-Cassegrain', waves: ['g'], aperture: 203, rTube: 115, u0: -20, u1: 330, color: 0xe8742a,
      mirrors: [primary, secondary], corrector, optics, surfaces: [...optics, ...walls(-20, 330, 115)], exitAxis: [-1, 0], uAperture: 322,
      focuser: { c: [-20, 0], axis: [-1, 0], r: 20, len: 60 },
    };
  }
  const tel = { ...t, ...findFocus(t) } as Telescope;
  if (tel.sensor) {
    // A camera telescope has no eyepiece: the image lands on a sensor at the focus.
    tel.u0 = tel.focus[0] - 14; tel.u1 = tel.uAperture + 10;
    tel.surfaces.push(...walls(tel.u0, tel.u1, tel.rTube));
    tel.surfaces.push({ type: 'plane', mode: 'absorb', c: tel.focus, n: [1, 0], half: tel.sensor[0] / 2 });
    tel.field = tel.sensor.map((mm) => 2 * Math.atan(mm / 2 / tel.focalLength) * 180 / Math.PI) as Vec2;
    return tel;
  }
  const ep: Plane = { type: 'plane', mode: 'lens', c: [tel.focus[0] + tel.exitAxis[0] * EYEPIECE_FL, tel.focus[1] + tel.exitAxis[1] * EYEPIECE_FL], n: tel.exitAxis, half: 14, f: EYEPIECE_FL };
  tel.eyepiece = ep;
  tel.surfaces.push(ep);
  tel.magnification = tel.focalLength / EYEPIECE_FL;
  tel.trueField = EYEPIECE_AFOV / tel.magnification;
  return tel;
}

// The part of the optics that forms the first focus (the eyepiece and tube walls are left out).
const imaging = (t: Draft): Surface[] => (t.type === 'newtonian' ? [t.mirrors![0], t.diagonal!] : t.optics);
const axisOrigin = (t: Draft): Vec2 => (t.type === 'newtonian' ? [650, 0] : [0, 0]);
const nearAxis = (t: Draft) => (t.lens ? 2 : t.type === 'newtonian' ? 30 : 40);

// Paraxial focus and effective focal length, found by tracing a ray close to the axis
// (just outside any central obstruction).
function findFocus(t: Draft): { focus: Vec2; focalLength: number } {
  const h = nearAxis(t);
  const c = crossing(imaging(t), [t.uAperture + 50, h], [-1, 0], axisOrigin(t), t.exitAxis);
  // Thin-lens style EFL: incoming height over outgoing angle to the exit axis.
  const perp: Vec2 = [-t.exitAxis[1], t.exitAxis[0]];
  return { focus: c.at, focalLength: h / Math.abs(dot(c.dir, perp) / dot(c.dir, t.exitAxis)) };
}

// Shapes the Schmidt plate numerically: for each height, find the bend that brings the ray to the
// paraxial focus of the two spherical mirrors. That is what a real corrector's aspheric profile does.
function schmidtProfile(primary: Conic, secondary: Conic, uPlate: number) {
  const mirrors = [primary, secondary];
  // Start each design ray just below the secondary so its back doesn't block the central heights.
  const below = uPlate - 300;
  const cross = (h: number, bend: number) => crossing(mirrors, [300, h + below * bend], norm([-1, bend]), [0, 0], [-1, 0]).at[0];
  const h0 = (primary.rMin ?? 0) + 2;
  const target = cross(h0, 0) + (cross(h0, 0) - cross(h0 + 4, 0)) * h0 * h0 / ((h0 + 4) ** 2 - h0 * h0); // paraxial limit
  const step = 2, table: (number | null)[] = [];
  for (let h = 0; h <= 104; h += step) {
    if (h < h0) { table.push(null); continue; }
    // Bisection: a steeper bend moves the crossing monotonically.
    let lo = -0.003, hi = 0.003; // wider bends send the ray past parallel and flip the crossing
    const sLo = Math.sign(cross(h, lo) - target);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(cross(h, mid) - target) === sLo) lo = mid; else hi = mid;
    }
    table.push((lo + hi) / 2);
  }
  // Heights inside the central hole never reach the mirrors; give them the usual cubic profile.
  const first = table.findIndex((x) => x !== null);
  const vals = table.map((x, i) => x ?? (table[first] as number) * (i / first) ** 3);
  return (y: number) => {
    const ay = Math.min(Math.abs(y), 104) / step, i = Math.min(Math.floor(ay), vals.length - 2), f = ay - i;
    return Math.sign(y) * (vals[i] * (1 - f) + vals[i + 1] * f);
  };
}

// Traces a fan of rays from a star `angle` radians off the tube axis (positive toward +v).
export function rayFan(t: Telescope, angle: number, count = 15): Ray[] {
  const d: Vec2 = [-Math.cos(angle), -Math.sin(angle)];
  const back = 400;
  const rays: Ray[] = [];
  for (let i = 0; i < count; i++) {
    const h = (-0.5 + i / (count - 1)) * t.aperture * 0.96;
    const p: Vec2 = [t.uAperture + back * Math.cos(angle) + 5, h + back * Math.sin(angle)];
    for (const w of t.waves) { const r = trace(t.surfaces, p, d, w, 120); rays.push({ wave: w, pts: r.pts, alive: r.alive }); }
  }
  return rays;
}

// Spread of the axis crossings of rays across the aperture, for the self-check.
export function focusSpread(t: Telescope) {
  const lo = t.lens ? 2 : t.type === 'newtonian' ? 26 : 38;
  const xs: number[] = [];
  for (let h = lo; h <= t.aperture * 0.48; h += 2) xs.push(dot(crossing(imaging(t), [t.uAperture + 50, h], [-1, 0], axisOrigin(t), t.exitAxis).at, t.exitAxis));
  return Math.max(...xs) - Math.min(...xs);
}

// Distance between the red and blue foci of a near-axis ray, for the self-check.
export function chromaticShift(t: Telescope) {
  const focusU = (w: Wave) => crossing(t.optics, [t.uAperture + 50, 5], [-1, 0], [0, 0], [-1, 0], w).at[0];
  return Math.abs(focusU('r') - focusU('b'));
}
