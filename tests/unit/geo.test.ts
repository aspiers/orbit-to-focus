import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLACES } from '../../src/constants.ts';
import { here, locate, nextPlace, roundDeg } from '../../src/geo.ts';
import { settings } from '../../src/store.ts';

const D2R = Math.PI / 180, defaults = settings.get();
// Answers getCurrentPosition with a fix, or with a refusal when given none, after an optional step in between.
const browser = (fix?: [number, number], between = () => {}) => vi.stubGlobal('navigator', {
  geolocation: {
    getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
      between();
      if (fix) ok({ coords: { latitude: fix[0], longitude: fix[1] } } as GeolocationPosition);
      else fail({ code: 1 } as GeolocationPositionError);
    },
  },
});

afterEach(() => { vi.unstubAllGlobals(); settings.set(defaults); });

describe('visitor location', () => {
  it('starts at Greenwich Observatory', () => {
    expect(defaults.lat / D2R).toBeCloseTo(51.4769, 6);
    expect(defaults.lon / D2R).toBeCloseTo(-0.0005, 6);
  });

  it('rounds to a tenth of a degree', () => {
    expect([roundDeg(48.85837), roundDeg(-122.41942), roundDeg(-33.86785)]).toEqual([48.9, -122.4, -33.9]);
  });

  it('moves to a shared location, rounded', () => {
    browser([-33.86785, 151.20732]);
    locate();
    expect(here).toEqual([-33.9, 151.2]);
    expect(settings.get().lat).toBe(-33.9 * D2R);
    expect(settings.get().lon).toBe(151.2 * D2R);
  });

  it('stays put when the browser refuses', () => {
    browser();
    locate();
    expect(settings.get()).toEqual(defaults);
  });

  it('keeps a place chosen while the browser was asking', () => {
    browser([10, 20], () => settings.set({ lat: 0, lon: 0 }));
    locate();
    expect([settings.get().lat, settings.get().lon]).toEqual([0, 0]);
  });

  it('copes with a browser that has no geolocation', () => {
    vi.stubGlobal('navigator', {});
    expect(() => locate()).not.toThrow();
  });
});

describe('the P key', () => {
  const place = () => [+(settings.get().lat / D2R).toFixed(4), +(settings.get().lon / D2R).toFixed(4)];
  const names = (mine: [number, number] | null, n: number) => Array.from({ length: n }, () => {
    nextPlace(mine);
    const [la, lo] = place();
    return PLACES.find(([, pla, plo]) => pla === la && plo === lo)?.[0] ?? `${la},${lo}`;
  });

  it('steps through the places in list order and wraps round', () => {
    expect(names(null, PLACES.length)).toEqual([...PLACES.slice(1), PLACES[0]].map(([n]) => n));
  });

  it('includes your location first, once the browser has shared it', () => {
    expect(names([-33.9, 151.2], 3)).toEqual([PLACES[1][0], PLACES[2][0], PLACES[3][0]]);
    settings.set({ lat: PLACES.at(-1)![1] * D2R, lon: PLACES.at(-1)![2] * D2R });
    expect(names([-33.9, 151.2], 2)).toEqual(['-33.9,151.2', PLACES[0][0]]);
  });

  it('goes to the first place from anywhere not in the list', () => {
    settings.set({ lat: 12.3 * D2R, lon: 45.6 * D2R });
    expect(names(null, 1)).toEqual([PLACES[0][0]]);
    settings.set({ lat: 12.3 * D2R, lon: 45.6 * D2R });
    expect(names([-33.9, 151.2], 1)).toEqual(['-33.9,151.2']);
  });
});
