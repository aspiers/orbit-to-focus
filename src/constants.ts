import type { TelescopeType } from './optics.ts';

// World units: Earth radius = 1. Distances between bodies are shrunk so everything fits on screen.
export const SUN_R = 12, ORBIT_R = 220, MOON_ORBIT_R = 14, MOON_R = 0.27, SHELL_R = 4;
// Site objects are drawn 60x larger than true scale relative to Earth so the zoom stays smooth.
export const METRE = (1 / 6371000) * 60;
export const SKY_R = 1000; // background sky sphere, centred on the camera
// Camera zoom is log10 of distance in world units; LM is one metre at the site's scale.
export const LM = Math.log10(METRE);

export const COLORS = { eq: 0x5cc8ff, ecl: 0xff9b45, hor: 0x7fdc8c, mer: 0xff6fa8, moon: 0xc7c0ff, sun: 0xffd27a, axis: 0xffffff, brass: 0xe0b866 };

// RA and Dec in degrees (J2000); null for bodies computed each frame.
export const TARGETS: [string, number | null, number | null][] = [
  ['Vega', 279.234, 38.784], ['Polaris', 37.95, 89.264],
  // Sigma Octantis, the nearest naked-eye star to the south celestial pole: SIMBAD (HIP 104382), ICRS J2000.
  ['Sigma Octantis', 317.195, -88.957], ['Arcturus', 213.915, 19.182], ['Betelgeuse', 88.793, 7.407],
  ['Sirius', 101.287, -16.716], ['Capella', 79.172, 45.998], ['Altair', 297.696, 8.868], ['Deneb', 310.358, 45.28],
  ['Rigel', 78.634, -8.202], ['Spica', 201.298, -11.161], ['Antares', 247.352, -26.432], ['Pleiades (M45)', 56.871, 24.105],
  ['Mizar & Alcor', 200.981, 54.925], ['Orion Nebula (M42)', 83.822, -5.391], ['Andromeda Galaxy (M31)', 10.685, 41.269],
  ['Albireo', 292.68, 27.96], ['Moon', null, null], ['Custom', null, null],
];

export const SPEEDS: [string, number][] = [
  ['Paused', 0], ['Real time', 1], ['1 min / s', 60], ['10 min / s', 600], ['1 hour / s', 3600],
  ['6 hours / s', 21600], ['1 day / s', 86400], ['1 week / s', 604800],
];

// The first is the default location.
export const PLACES: [string, number, number][] = [
  ['Greenwich Observatory', 51.4769, -0.0005], ['Equator (Quito)', -0.18, -78.47], ['North Pole', 89.99, 0],
  ['South Pole', -89.99, 0], ['Sydney', -33.87, 151.21], ['Mauna Kea', 19.82, -155.47],
];

export type StopId = 'solar' | 'moon' | 'earth' | 'site' | 'scope' | 'optics' | 'focus';
export interface Stop { id: StopId; name: string; hint: string; L: number; pitch: number }
export const STOPS: Stop[] = [
  { id: 'solar', name: 'Solar system', hint: 'Earth’s orbit', L: 2.85, pitch: 28 },
  { id: 'moon', name: 'Earth & Moon', hint: 'Moon’s orbit', L: 1.6, pitch: 22 },
  { id: 'earth', name: 'Earth & sky', hint: 'celestial sphere', L: 1.08, pitch: 18 },
  { id: 'site', name: 'Your site', hint: '8 m away', L: LM + Math.log10(8), pitch: 4 },
  { id: 'scope', name: 'Telescope', hint: '3 m away', L: LM + Math.log10(3), pitch: -2 },
  { id: 'optics', name: 'Inside the tube', hint: 'lens to sensor', L: LM - 0.35, pitch: 0 },
  { id: 'focus', name: 'At the focus', hint: 'a few mm', L: LM - 2.2, pitch: 0 },
];

// Sensors stored as [short side, long side] in mm; the short side lies in the drawn slice.
export const SENSORS: [string, number, number][] = [
  ['Seestar S50 Pro (1/1.2″)', 6.264, 11.136], ['Seestar S50 (1/2.8″)', 3.132, 5.568],
  ['Micro Four Thirds', 13, 17.3], ['APS-C', 15.6, 23.5], ['Full frame', 24, 36],
];

export const TELESCOPES: [TelescopeType, string][] = [
  ['seestar', 'Seestar S50 Pro'], ['petzval', 'Petzval astrograph'], ['refractor', 'Refractor'],
  ['newtonian', 'Newtonian'], ['dobsonian', 'Dobsonian'], ['sct', 'Schmidt-Cassegrain'],
];
