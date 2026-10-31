import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, shareLink } from '../../src/url.ts';
import { settings, type Settings } from '../../src/store.ts';
import { TARGETS } from '../../src/constants.ts';

const defaults = settings.get();

describe('address bar', () => {
  it('writes nothing for the defaults', () => {
    expect(encodeState(defaults, 'solar')).toBe('');
  });

  it('round-trips changed settings', () => {
    const s: Settings = {
      ...defaults, lat: (-30 * Math.PI) / 180, lesson: 11, tab: 'scope', speed: -3600, mountMode: 'eq', telescope: 'refractor',
      layers: { ...defaults.layers, ground: true }, custom: { ...defaults.custom, focal: 400 },
    };
    const d = decodeState('#' + encodeState(s, 'scope'));
    expect(d.lesson).toBe(11);
    expect(d.view).toBe('scope');
    expect({ ...defaults, ...d.patch, lesson: 11 }).toEqual(s);
  });

  it('round-trips a custom target', () => {
    const custom = TARGETS.findIndex(([n]) => n === 'Custom'), s = { ...defaults, target: custom, customRa: Math.PI / 3, customDec: -Math.PI / 8 };
    const d = decodeState('#' + encodeState(s, 'eye'));
    expect(d.view).toBe('eye');
    expect(d.patch.target).toBe(custom);
    expect(d.patch.customRa).toBeCloseTo(Math.PI / 3, 4);
    expect(d.patch.customDec).toBeCloseTo(-Math.PI / 8, 4);
  });

  it('ignores junk', () => {
    const allOff = Object.fromEntries(Object.keys(defaults.layers).map((k) => [k, false]));
    expect(decodeState('#loc=999,0&scope=evil&speed=abc&layers=').patch).toEqual({ layers: allOff });
    expect(decodeState('#view=nowhere&lesson=0&tab=x&focal=5&preset=99&sensor=1x2x3')).toEqual({ lesson: undefined, view: undefined, patch: {} });
    expect(decodeState('#%%%&&=')).toEqual({ lesson: undefined, view: undefined, patch: {} });
  });

  it('leaves the place out of a link to share', () => {
    const s: Settings = { ...defaults, lat: (51.5 * Math.PI) / 180, lon: 0, tab: 'scope' };
    expect(encodeState(s, 'site')).toContain('loc=');
    const link = shareLink(s, 'site', 'https://example.org/otf/');
    expect(link).toBe('https://example.org/otf/#tab=scope&view=site');
    // Without a place the receiver's app asks for theirs, or stays at Greenwich.
    expect(decodeState(new URL(link).hash).patch.lat).toBeUndefined();
    expect(shareLink({ ...s, tab: defaults.tab }, 'solar', 'https://example.org/otf/')).toBe('https://example.org/otf/');
  });

  it('opens old #lessonN links', () => {
    expect(decodeState('#lesson7').lesson).toBe(6);
  });

  it('keeps a Dobsonian in alt-az mode', () => {
    expect(decodeState('#scope=dobsonian&mount=eq').patch.mountMode).toBe('altaz');
  });

  it('clamps the aperture to f/2.5', () => {
    expect(decodeState('#focal=200&aperture=400').patch.custom).toMatchObject({ focal: 200, aperture: 80 });
  });
});
