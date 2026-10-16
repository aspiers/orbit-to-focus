import { describe, expect, it } from 'vitest';
import * as A from '../../src/astro.ts';

const LAT = 51.4769, lat = LAT * A.D2R, lon = -0.0005 * A.D2R; // Greenwich Observatory
const deg = (rad: number) => rad * A.R2D;

describe('astronomy', () => {
  it('puts the June solstice Sun at RA 6h, Dec +23.44', () => {
    const sun = A.eclipticToEquatorial(A.sunEcliptic(Date.UTC(2026, 5, 21, 8, 24)));
    expect(deg(sun.dec)).toBeCloseTo(23.44, 1);
    expect(Math.abs(deg(sun.ra) - 90)).toBeLessThan(0.5);
  });

  it('keeps Polaris within its polar distance of the latitude all night', () => {
    for (let h = 0; h < 24; h += 3) {
      const p = A.horizontal(37.95 * A.D2R, 89.264 * A.D2R, Date.UTC(2026, 9, 16, h), lat, lon);
      expect(Math.abs(deg(p.alt) - LAT)).toBeLessThan(0.75);
    }
  });

  it('puts a star on the meridian due south at altitude 90 - latitude', () => {
    const t = Date.UTC(2026, 9, 16, 22);
    const m = A.horizontal(A.gmst(t) + lon, 0, t, lat, lon);
    expect(deg(m.alt)).toBeCloseTo(90 - LAT, 6);
    expect(deg(m.az)).toBeCloseTo(180, 6);
  });

  it('gives GMST 280.46 degrees at J2000.0', () => {
    expect(deg(A.gmst(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.46061837, 6);
  });

  it('turns the sky once per sidereal day', () => {
    const t = Date.UTC(2026, 9, 16), dt = A.SIDEREAL_DAY_S * 1000;
    expect(Math.abs(A.wrapPi(A.gmst(t + dt) - A.gmst(t)))).toBeLessThan(1e-6);
    // 15.04 degrees per hour of clock time.
    expect(deg(A.wrapPi(A.gmst(t + 3600000) - A.gmst(t)))).toBeCloseTo(15.0411, 3);
  });

  it('round-trips between angles and vectors', () => {
    for (const [lo, la] of [[0, 0], [1, 0.5], [3, -1.2], [5.5, 1.5]]) {
      const back = A.vecToSph(A.sphToVec(lo, la));
      expect(back.lon).toBeCloseTo(lo, 9);
      expect(back.lat).toBeCloseTo(la, 9);
    }
  });

  it('gives horizontal coordinates that point back at the same RA and Dec', () => {
    const t = Date.UTC(2026, 9, 16, 21);
    for (const [ra, dec] of [[279.234, 38.784], [101.287, -16.716], [10, 70], [200, 5]]) {
      const h = A.horizontal(ra * A.D2R, dec * A.D2R, t, lat, lon);
      // Back from (alt, az) to (HA, Dec) with the standard inverse, then RA = LST - HA.
      const sinDec = Math.sin(h.alt) * Math.sin(lat) + Math.cos(h.alt) * Math.cos(lat) * Math.cos(h.az);
      const ha = Math.atan2(-Math.sin(h.az) * Math.cos(h.alt), Math.sin(h.alt) * Math.cos(lat) - Math.cos(h.alt) * Math.sin(lat) * Math.cos(h.az));
      expect(deg(Math.asin(sinDec))).toBeCloseTo(dec, 6);
      expect(deg(A.wrapPi(h.lst - ha - ra * A.D2R))).toBeCloseTo(0, 6);
      expect(h.ha).toBeCloseTo(A.wrapPi(h.lst - ra * A.D2R), 9);
    }
  });

  it('puts the Moon near the Sun at the 2024-04-08 total solar eclipse', () => {
    const t = Date.UTC(2024, 3, 8, 18, 18);
    const gap = A.wrapPi(A.moonEcliptic(t).lon - A.sunEcliptic(t).lon);
    expect(Math.abs(deg(gap))).toBeLessThan(1.5);
  });
});
