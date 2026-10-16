import { describe, expect, it } from 'vitest';
import * as O from '../../src/optics.ts';

const DESIGNS = ['seestar', 'refractor', 'newtonian', 'dobsonian', 'sct', 'petzval'] as const;
const D2R = Math.PI / 180;

// A ray reaches the image if it lands on the sensor or leaves through the eyepiece.
const reachesImage = (t: O.Telescope, r: O.Ray) => {
  if (!t.sensor) return r.alive;
  const [u, v] = r.pts.at(-1)!;
  return Math.abs(u - t.focus[0]) < 1e-6 && Math.abs(v) <= t.sensor[0] / 2 + 1e-6;
};

describe('optics', () => {
  it.each(DESIGNS)('%s: the correction removes the main aberration', (type) => {
    const good = O.makeTelescope(type, true), bad = O.makeTelescope(type, false);
    if (good.lens) expect(O.chromaticShift(good)).toBeLessThan(O.chromaticShift(bad) / 5);
    else expect(O.focusSpread(good)).toBeLessThan(O.focusSpread(bad) / 5);
  });

  it.each([
    ['seestar', 260, 8], ['refractor', 600, 5], ['newtonian', 750, 1], ['dobsonian', 750, 1], ['sct', 2000, 150], ['petzval', 400, 12],
  ] as const)('%s: focal length is %i mm', (type, focal, tol) => {
    expect(Math.abs(O.makeTelescope(type, true).focalLength - focal)).toBeLessThanOrEqual(tol);
  });

  it('gives the Seestar its 2.8 degree diagonal field', () => {
    expect(Math.abs(Math.hypot(...O.makeTelescope('seestar', true).field!) - 2.8)).toBeLessThanOrEqual(0.15);
  });

  it.each(DESIGNS)('%s: starlight on the axis reaches the image, starlight at 30 degrees is blocked', (type) => {
    const t = O.makeTelescope(type, true);
    expect(O.rayFan(t, 0).filter((r) => reachesImage(t, r)).length).toBeGreaterThan(0);
    const steep = O.rayFan(t, 30 * D2R);
    expect(steep.filter((r) => reachesImage(t, r))).toHaveLength(0);
    // Stopped by a tube wall, not just aimed past the image.
    expect(steep.some((r) => !r.alive && Math.abs(Math.abs(r.pts.at(-1)![1]) - t.rTube) < 1)).toBe(true);
  });

  it.each([[100, 20], [260, 50], [600, 120], [1200, 200], [400, 140]])('custom camera refractor %i mm / %i mm keeps its focal length', (focal, aperture) => {
    const c = O.makeTelescope('seestar', true, { focal, aperture, sensor: [10, 10] });
    expect(Math.abs(c.focalLength - focal)).toBeLessThanOrEqual(focal * 0.04);
  });

  // Each slider step rebuilds the telescope; this once took seconds and froze the page.
  it('rebuilds a telescope fast enough for every slider step', () => {
    const t0 = performance.now();
    for (let focal = 100; focal <= 1200; focal += 10) O.makeTelescope('seestar', focal % 20 === 0, { focal, aperture: Math.floor(focal / 2.5), sensor: [10, 10] });
    for (const type of DESIGNS) for (const corrected of [true, false]) O.makeTelescope(type, corrected);
    const perBuild = (performance.now() - t0) / (111 + DESIGNS.length * 2);
    expect(perBuild).toBeLessThan(10);
  });
});
