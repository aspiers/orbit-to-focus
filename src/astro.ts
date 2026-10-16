// Low-precision astronomy: good to a fraction of a degree, which is plenty for a teaching model.
// Coordinates ignore precession and nutation (J2000 throughout).
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const OBLIQUITY = 23.4393 * D2R;
export const SIDEREAL_DAY_S = 86164.0905;

const daysSinceJ2000 = (ms: number) => ms / 86400000 + 2440587.5 - 2451545.0;
const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const wrapPi = (a: number) => wrap(a + Math.PI) - Math.PI;

// Greenwich mean sidereal time as an angle (radians).
export const gmst = (ms: number) => wrap((280.46061837 + 360.98564736629 * daysSinceJ2000(ms)) * D2R);

// Geocentric ecliptic longitude/latitude of the Sun.
export interface Spherical { lon: number; lat: number }

export function sunEcliptic(ms: number): Spherical {
  const d = daysSinceJ2000(ms);
  const g = (357.528 + 0.9856003 * d) * D2R;
  const L = 280.46 + 0.9856474 * d;
  return { lon: wrap((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R), lat: 0 };
}

// Geocentric ecliptic longitude/latitude of the Moon (main terms only, about 1 degree accuracy).
export function moonEcliptic(ms: number): Spherical {
  const d = daysSinceJ2000(ms);
  const L = (218.316 + 13.176396 * d) * D2R;
  const M = (134.963 + 13.064993 * d) * D2R;
  const F = (93.272 + 13.22935 * d) * D2R;
  return { lon: wrap(L + 6.289 * D2R * Math.sin(M)), lat: 5.128 * D2R * Math.sin(F) };
}

// Unit vector for (longitude, latitude) in a frame with X toward longitude 0, Y toward the pole and
// longitude growing toward -Z. RA/Dec, ecliptic and Earth's own lon/lat all use this convention.
export type Vec3 = [number, number, number];
export const sphToVec = (lon: number, lat: number): Vec3 => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
export const vecToSph = ([x, y, z]: Vec3): Spherical => ({ lon: wrap(Math.atan2(-z, x)), lat: Math.asin(Math.max(-1, Math.min(1, y))) });

export function eclipticToEquatorial({ lon, lat }: Spherical): { ra: number; dec: number } {
  const [x, y, z] = sphToVec(lon, lat);
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  // Rotate about the equinox (X) axis by +obliquity.
  const r = vecToSph([x, y * c - z * s, y * s + z * c]);
  return { ra: r.lon, dec: r.lat };
}

// Hour angle, altitude and azimuth (from north through east) of an RA/Dec seen from lat/lon.
export interface Horizontal { lst: number; ha: number; alt: number; az: number }

export function horizontal(ra: number, dec: number, ms: number, lat: number, lon: number): Horizontal {
  const lst = wrap(gmst(ms) + lon);
  const ha = wrapPi(lst - ra);
  const alt = Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha));
  const az = wrap(Math.atan2(-Math.cos(dec) * Math.sin(ha), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha)));
  return { lst, ha, alt, az };
}
