// 2D ray tracer for a slice through a telescope. Units are millimetres.
// u runs along the tube axis (positive toward the sky), v across it. Light from a star travels toward -u.
export const EYEPIECE_FL = 25;
export const EYEPIECE_AFOV = 52;

// Refractive indices at the C (red), d (yellow) and F (blue) lines.
const GLASS = {
  BK7: { r: 1.51432, g: 1.5168, b: 1.52238 },
  F2: { r: 1.61503, g: 1.62004, b: 1.63208 },
  FPL53: { r: 1.43733, g: 1.43875, b: 1.44195 }, // ED (extra-low dispersion) fluorophosphate crown
};

// Seestar S50 Pro telephoto camera: 3840 x 2160 pixels of 2.9 um (ZWO quotes a 2.8 degree diagonal field).
export const SEESTAR_SENSOR_MM = [6.264, 11.136];
const index = (glass, wave) => (glass ? GLASS[glass][wave] : 1);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const reflect = (d, n) => { const k = 2 * dot(d, n); return [d[0] - k * n[0], d[1] - k * n[1]]; };

function refract(d, n, n1, n2) {
  if (dot(d, n) > 0) n = [-n[0], -n[1]];
  const eta = n1 / n2, cosi = -dot(n, d), k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return reflect(d, n);
  const c = eta * cosi - Math.sqrt(k);
  return norm([eta * d[0] + c * n[0], eta * d[1] + c * n[1]]);
}

// Conic of revolution with its vertex at u0: v^2 - 2R x + (1+k) x^2 = 0, x = u - u0, centre of curvature at x = R.
// k = 0 is a sphere, -1 a paraboloid, < -1 a hyperboloid. R = Infinity is a flat.
function hitConic(s, p, d) {
  const px = p[0] - s.u0, py = p[1], [dx, dy] = d;
  let ts;
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
  let best = null;
  for (const t of ts) {
    if (!(t > 1e-7)) continue;
    const x = px + t * dx, y = Math.abs(py + t * dy);
    if (y > s.rMax || y < (s.rMin || 0)) continue;
    if (isFinite(s.R) && Math.abs(x) > Math.abs(s.R)) continue; // far side of a sphere
    if (!best || t < best.t) best = { t, x, y: py + t * dy };
  }
  if (!best) return null;
  const n = isFinite(s.R) ? norm([-2 * s.R + 2 * (1 + s.k) * best.x, 2 * best.y]) : [1, 0];
  return { t: best.t, n };
}

// Plane through c with unit normal n, limited to `half` either side of c.
function hitPlane(c, n, half, p, d) {
  const den = dot(d, n);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - p[0]) * n[0] + (c[1] - p[1]) * n[1]) / den;
  if (!(t > 1e-7)) return null;
  const q = [p[0] + t * d[0], p[1] + t * d[1]];
  const y = (q[0] - c[0]) * -n[1] + (q[1] - c[1]) * n[0];
  return Math.abs(y) > half ? null : { t, n, y };
}

function hit(s, p, d) {
  switch (s.type) {
    case 'conic': return hitConic(s, p, d);
    case 'plane': return hitPlane(s.c, s.n, s.half, p, d);
    case 'corrector': return d[0] < 0 ? hitPlane([s.u0, 0], [1, 0], s.half, p, d) : null;
  }
}

// New direction after the surface, or null if the light is absorbed there.
function interact(s, h, d, wave) {
  if (s.mode === 'absorb') return null;
  if (s.mode === 'mirror') {
    // Mirrors only reflect on their silvered side; light arriving at the back is blocked.
    const front = s.type === 'conic' ? d[0] * s.facing < 0 : dot(d, s.n) < 0;
    return front ? reflect(d, h.n) : null;
  }
  if (s.mode === 'refract') {
    const below = d[0] < 0;
    return refract(d, h.n, index(below ? s.above : s.below, wave), index(below ? s.below : s.above, wave));
  }
  // Thin elements bend a ray by changing its slope relative to their axis.
  if (s.type === 'corrector') return norm([-1, d[1] / -d[0] + s.delta(h.y)]);
  const a = s.n, perp = [-a[1], a[0]], along = dot(d, a);
  if (along <= 0) return d;
  const slope = dot(d, perp) / along - h.y / s.f;
  return norm([a[0] + slope * perp[0], a[1] + slope * perp[1]]);
}

export function trace(surfaces, p, d, wave = 'g', tail = 150) {
  const pts = [p];
  for (let i = 0; i < 20; i++) {
    let best = null, bs = null;
    for (const s of surfaces) {
      const h = hit(s, p, d);
      if (h && (!best || h.t < best.t)) { best = h; bs = s; }
    }
    if (!best) { pts.push([p[0] + d[0] * tail, p[1] + d[1] * tail]); return { pts, d, alive: true }; }
    p = [p[0] + d[0] * best.t, p[1] + d[1] * best.t];
    pts.push(p);
    d = interact(bs, best, d, wave);
    if (!d) return { pts, alive: false };
  }
  return { pts, alive: false };
}

// Where a ray leaving through `surfaces` crosses the line through `o` with direction `axis`.
function crossing(surfaces, p, d, o, axis) {
  const r = trace(surfaces, p, d);
  const a = r.pts.at(-2), b = r.pts.at(-1), dir = norm([b[0] - a[0], b[1] - a[1]]);
  const perp = [-axis[1], axis[0]];
  const t = -dot([a[0] - o[0], a[1] - o[1]], perp) / dot(dir, perp);
  return { at: [a[0] + dir[0] * t, a[1] + dir[1] * t], dir };
}

const lensSurfaces = (u0, elems) => {
  // elems: [{R, glassBelow, gap}] from the sky end down; returns refracting conics.
  let u = u0, above = null;
  return elems.map((e) => {
    const s = { type: 'conic', mode: 'refract', u0: u, R: e.R, k: 0, rMax: e.rMax, above, below: e.glass };
    above = e.glass; u -= e.gap;
    return s;
  });
};

const wall = (u0, u1, v) => ({ type: 'plane', mode: 'absorb', c: [(u0 + u1) / 2, v], n: [0, 1], half: (u1 - u0) / 2 });
const walls = (u0, u1, r) => [wall(u0, u1, r), wall(u0, u1, -r)];

// Builds a telescope. `corrected` switches on the part that removes the design's main aberration.
export function makeTelescope(type, corrected) {
  const t = { type, corrected, waves: ['g'], parts: [] };
  if (type === 'seestar') {
    // 50 mm f/5.2. ZWO's lens is a four-element ED apochromat whose prescription isn't published;
    // this stands in an air-spaced ED doublet with the same aperture and focal length, bent for minimum
    // spherical aberration (searched with the tracer below).
    t.name = 'Seestar S50 Pro';
    t.aperture = 50; t.rTube = 60; t.u0 = -14; t.u1 = 272; t.color = 0x3a3f4a; t.box = [120, 140];
    t.waves = ['r', 'g', 'b'];
    const elems = corrected
      ? [{ R: -113.884, glass: 'FPL53', gap: 7, rMax: 26 }, { R: 184.209, glass: null, gap: 1, rMax: 26 },
        { R: 153.984, glass: 'F2', gap: 3, rMax: 26 }, { R: 378.464, glass: null, gap: 0, rMax: 26 }]
      : [{ R: -268.7, glass: 'BK7', gap: 6, rMax: 26 }, { R: 268.7, glass: null, gap: 0, rMax: 26 }];
    t.optics = lensSurfaces(262, elems);
    t.lens = { top: 262, surfaces: t.optics };
    t.surfaces = [...t.optics, ...walls(t.u0, t.u1, t.rTube)];
    t.exitAxis = [-1, 0];
    t.uAperture = 262;
    t.sensor = true;
  } else if (type === 'refractor') {
    t.name = 'Refractor';
    t.aperture = 80; t.rTube = 48; t.u0 = 70; t.u1 = 735; t.color = 0xe8e6df;
    t.waves = ['r', 'g', 'b'];
    const elems = corrected
      // Cemented achromat: crown (BK7) positive element and a flint (F2) negative one, f about 600 mm.
      ? [{ R: -277.986, glass: 'BK7', gap: 9, rMax: 41 }, { R: 259.695, glass: 'F2', gap: 4, rMax: 41 }, { R: 3036.94, glass: null, gap: 0, rMax: 41 }]
      : [{ R: -620, glass: 'BK7', gap: 9, rMax: 41 }, { R: 620, glass: null, gap: 0, rMax: 41 }];
    t.optics = lensSurfaces(640, elems);
    t.lens = { top: 640, surfaces: t.optics };
    t.surfaces = [...t.optics, ...walls(t.u0, t.u1, t.rTube)];
    t.exitAxis = [-1, 0];
    t.uAperture = 640;
  } else if (type === 'newtonian') {
    t.name = 'Newtonian reflector';
    t.aperture = 150; t.rTube = 90; t.u0 = -30; t.u1 = 820; t.color = 0x1b1e26;
    const primary = { type: 'conic', mode: 'mirror', facing: 1, u0: 0, R: 1500, k: corrected ? -1 : 0, rMax: 75 };
    const diag = { type: 'plane', mode: 'mirror', c: [650, 0], n: norm([-1, 1]), half: 24 };
    t.optics = [primary, diag];
    t.mirrors = [primary];
    t.diagonal = diag;
    t.surfaces = [primary, diag, wall(t.u0, 622, t.rTube), wall(678, t.u1, t.rTube), wall(t.u0, t.u1, -t.rTube)];
    t.exitAxis = [0, 1];
    t.uAperture = 820;
    t.focuser = { c: [650, t.rTube], axis: [0, 1], r: 20, len: 30 };
  } else {
    t.name = 'Schmidt-Cassegrain';
    t.aperture = 203; t.rTube = 115; t.u0 = -20; t.u1 = 330; t.color = 0xe8742a;
    const primary = { type: 'conic', mode: 'mirror', facing: 1, u0: 0, R: 800, k: 0, rMax: 101.5, rMin: 32 };
    const secondary = { type: 'conic', mode: 'mirror', facing: -1, u0: 313.3, R: 216.7, k: 0, rMax: 34 };
    t.mirrors = [primary, secondary];
    t.corrector = { type: 'corrector', mode: 'bend', u0: 322, half: 101.5, delta: schmidtProfile(primary, secondary, 322) };
    const plate = corrected ? t.corrector : { ...t.corrector, delta: () => 0 };
    t.optics = [plate, primary, secondary];
    t.surfaces = [...t.optics, ...walls(t.u0, t.u1, t.rTube)];
    t.exitAxis = [-1, 0];
    t.uAperture = 322;
    t.focuser = { c: [-20, 0], axis: [-1, 0], r: 20, len: 60 };
  }
  findFocus(t);
  if (t.sensor) {
    // A smart telescope has no eyepiece: the image lands on a camera chip at the focus.
    const half = SEESTAR_SENSOR_MM[0] / 2;
    t.sensorPlane = { type: 'plane', mode: 'absorb', c: t.focus, n: [1, 0], half };
    t.surfaces.push(t.sensorPlane);
    t.field = SEESTAR_SENSOR_MM.map((mm) => 2 * Math.atan(mm / 2 / t.focalLength) * 180 / Math.PI);
    return t;
  }
  const ep = { type: 'plane', mode: 'lens', c: [t.focus[0] + t.exitAxis[0] * EYEPIECE_FL, t.focus[1] + t.exitAxis[1] * EYEPIECE_FL], n: t.exitAxis, half: 14, f: EYEPIECE_FL };
  t.eyepiece = ep;
  t.surfaces.push(ep);
  t.magnification = t.focalLength / EYEPIECE_FL;
  t.trueField = EYEPIECE_AFOV / t.magnification;
  return t;
}

// Paraxial focus and effective focal length, found by tracing a ray close to the axis
// (just outside any central obstruction).
function findFocus(t) {
  const h = t.lens ? 2 : t.type === 'newtonian' ? 30 : 40;
  const p = [t.uAperture + 50, h];
  const optics = t.type === 'newtonian' ? [t.mirrors[0], t.diagonal] : t.optics;
  const o = t.type === 'newtonian' ? [650, 0] : [0, 0];
  const c = crossing(optics, p, [-1, 0], o, t.exitAxis);
  // Thin-lens style EFL: incoming height over outgoing angle to the exit axis.
  const perp = [-t.exitAxis[1], t.exitAxis[0]];
  t.focus = c.at;
  t.focalLength = h / Math.abs(dot(c.dir, perp) / dot(c.dir, t.exitAxis));
}

// Shapes the Schmidt plate numerically: for each height, find the bend that brings the ray to the
// paraxial focus of the two spherical mirrors. That is what a real corrector's aspheric profile does.
function schmidtProfile(primary, secondary, uPlate) {
  const mirrors = [primary, secondary];
  // Start each design ray just below the secondary so its back doesn't block the central heights.
  const below = uPlate - 300;
  const cross = (h, bend) => crossing(mirrors, [300, h + below * bend], norm([-1, bend]), [0, 0], [-1, 0]).at[0];
  const h0 = primary.rMin + 2;
  const target = cross(h0, 0) + (cross(h0, 0) - cross(h0 + 4, 0)) * h0 * h0 / ((h0 + 4) ** 2 - h0 * h0); // paraxial limit
  const step = 2, table = [];
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
  for (let i = 0; i < first; i++) table[i] = table[first] * (i / first) ** 3;
  return (y) => {
    const ay = Math.min(Math.abs(y), 104) / step, i = Math.min(Math.floor(ay), table.length - 2), f = ay - i;
    return Math.sign(y) * (table[i] * (1 - f) + table[i + 1] * f);
  };
}

// Traces a fan of rays from a star `angle` radians off the tube axis (positive toward +v).
export function rayFan(t, angle, count = 15) {
  const d = [-Math.cos(angle), -Math.sin(angle)];
  const back = 400;
  const rays = [];
  for (let i = 0; i < count; i++) {
    const h = (-0.5 + i / (count - 1)) * t.aperture * 0.96;
    const p = [t.uAperture + back * Math.cos(angle) + 5, h + back * Math.sin(angle)];
    for (const w of t.waves) rays.push({ wave: w, ...trace(t.surfaces, p, d, w, 120) });
  }
  return rays;
}

// Spread of the axis crossings of the rays that reach the eyepiece, for the self-check.
export function focusSpread(t, wave = 'g') {
  const opt = t.type === 'newtonian' ? [t.mirrors[0], t.diagonal] : t.optics;
  const o = t.type === 'newtonian' ? [650, 0] : [0, 0];
  const lo = t.lens ? 2 : t.type === 'newtonian' ? 26 : 38;
  const xs = [];
  for (let h = lo; h <= t.aperture * 0.48; h += 2) {
    const c = crossing(opt, [t.uAperture + 50, h], [-1, 0], o, t.exitAxis).at;
    xs.push(dot(c, t.exitAxis));
  }
  return Math.max(...xs) - Math.min(...xs);
}

// Distance between the red and blue foci of a near-axis ray, for the self-check.
export function chromaticShift(t) {
  const focusU = (w) => {
    const [a, b] = trace(t.optics, [t.uAperture + 50, 5], [-1, 0], w).pts.slice(-2);
    return a[0] - (a[1] * (b[0] - a[0])) / (b[1] - a[1]);
  };
  return Math.abs(focusU('r') - focusU('b'));
}
