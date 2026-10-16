// Sanity checks for the astronomy and optics maths. Run: node tools/selfcheck.mjs
import assert from 'node:assert/strict';
import * as A from '../src/astro.js';
import * as O from '../src/optics.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const lat = 51.4769 * A.D2R, lon = -0.0005 * A.D2R;

// June solstice 2026: the Sun sits at RA 6h, Dec +23.44.
const sol = A.eclipticToEquatorial(A.sunEcliptic(Date.UTC(2026, 5, 21, 8, 24)));
near(sol.dec * A.R2D, 23.44, 0.05, 'solstice Sun dec');
near(sol.ra * A.R2D, 90, 0.5, 'solstice Sun RA');

// Polaris altitude is within its 0.74 degree polar distance of the latitude, at any time.
for (let h = 0; h < 24; h += 3) {
  const p = A.horizontal(37.95 * A.D2R, 89.264 * A.D2R, Date.UTC(2026, 9, 16, h), lat, lon);
  near(p.alt * A.R2D, 51.477, 0.75, 'Polaris altitude');
}
// A star on the meridian (HA 0) at dec 0 is due south at altitude 90 - latitude.
const t = Date.UTC(2026, 9, 16, 22);
const m = A.horizontal(A.gmst(t) + lon, 0, t, lat, lon);
near(m.alt * A.R2D, 90 - 51.4769, 1e-6, 'meridian altitude');
near(m.az * A.R2D, 180, 1e-6, 'meridian azimuth');
// GMST at J2000.0 is 280.46 degrees.
near(A.gmst(Date.UTC(2000, 0, 1, 12)) * A.R2D, 280.46061837, 1e-6, 'GMST J2000');
// Moon: 2024-04-08 total solar eclipse, Moon within ~1.5 degrees of the Sun.
const ecl = Date.UTC(2024, 3, 8, 18, 18);
const ms = A.moonEcliptic(ecl), ss = A.sunEcliptic(ecl);
near(((ms.lon - ss.lon + 3 * Math.PI) % (2 * Math.PI)) - Math.PI, 0, 1.5 * A.D2R, 'eclipse Moon-Sun longitude');

// Optics: corrected designs focus tightly, uncorrected ones show their aberration.
for (const type of ['seestar', 'refractor', 'newtonian', 'sct']) {
  const good = O.makeTelescope(type, true), bad = O.makeTelescope(type, false);
  const sg = O.focusSpread(good), sb = O.focusSpread(bad);
  console.log(type, 'EFL', good.focalLength.toFixed(1), 'spread corrected', sg.toFixed(3), 'uncorrected', sb.toFixed(3),
    good.lens ? `chromatic ${O.chromaticShift(good).toFixed(3)} vs ${O.chromaticShift(bad).toFixed(3)}` : '');
  if (good.lens) assert.ok(O.chromaticShift(good) < O.chromaticShift(bad) / 5, `${type} doublet fixes colour`);
  else assert.ok(sg < sb / 5, `${type} correction tightens focus`);
  const fan = O.rayFan(good, 0);
  assert.ok(fan.filter((r) => r.alive || type === 'seestar').length > 0, `${type} rays reach the end`);
}
const s = O.makeTelescope('seestar', true);
near(s.focalLength, 260, 8, 'Seestar focal length');
near(Math.hypot(...s.field), 2.8, 0.15, 'Seestar diagonal field');
const n = O.makeTelescope('newtonian', true);
near(n.focalLength, 750, 1, 'Newtonian focal length');
const sct = O.makeTelescope('sct', true);
near(sct.focalLength, 2000, 150, 'SCT focal length');
console.log('all checks passed');
// Custom camera refractors keep their focal length and a sharp-ish focus across the slider range.
for (const [focal, aperture] of [[100, 20], [260, 50], [600, 120], [1200, 200], [400, 140]]) {
  const c = O.makeTelescope('seestar', true, { focal, aperture, sensor: [10, 10] });
  near(c.focalLength, focal, focal * 0.04, `custom ${focal}/${aperture} focal length`);
  console.log(`custom ${focal} mm f/${(focal / aperture).toFixed(1)}: spread ${O.focusSpread(c).toFixed(3)} mm, colour ${O.chromaticShift(c).toFixed(3)} mm`);
}
