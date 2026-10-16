import { afterEach, describe, expect, it, vi } from 'vitest';
import { here, locate, roundDeg } from '../../src/geo.ts';
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
