import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS, applyLesson, followHemisphere } from '../../src/lessons.tsx';
import { settings } from '../../src/store.ts';
import type { SceneApi } from '../../src/scene/Scene.ts';
import { GROUPS } from '../../src/components/Shortcuts.tsx';
import { STOPS, TARGETS, TELESCOPES } from '../../src/constants.ts';
import { D2R, R2D, horizontal } from '../../src/astro.ts';

// The text of every <kbd> in a lesson body.
function kbds(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => kbds(n, out));
  else if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === 'kbd') out.push(String(node.props.children));
    else kbds(node.props.children, out);
  }
  return out;
}

const SHORTCUT_KEYS = new Set(GROUPS.flatMap(([, list]) => list.filter((s) => s.run).flatMap((s) => s.keys.map((k) => k.toLowerCase()))));

describe.each(LESSONS.map((l, i) => [i + 1, l.title, l] as const))('guide %i: %s', (_n, _title, l) => {
  it('names a target, telescope and view that exist', () => {
    if (l.target) expect(TARGETS.map(([n]) => n)).toContain(l.target);
    for (const n of l.southTarget ?? []) expect(TARGETS.map(([t]) => t)).toContain(n);
    if (l.telescope) expect(TELESCOPES.map(([id]) => id)).toContain(l.telescope);
    if (typeof l.view === 'object' && 'stop' in l.view) expect(STOPS.map((s) => s.id)).toContain(l.view.stop);
  });

  it('only mentions keys that have a shortcut', () => {
    for (const k of kbds(l.body)) expect(SHORTCUT_KEYS, `<kbd>${k}</kbd>`).toContain(k.toLowerCase());
  });
});

it('mentions at least one key somewhere in the guide', () => {
  expect(LESSONS.flatMap((l) => kbds(l.body)).length).toBeGreaterThan(0);
});

// Words that must appear in each step at a northern latitude and at a southern one, and never in the other.
const HEMISPHERE_WORDS: [string, string[], string[]][] = [
  ['The meridian', ['facing south', 'from due north'], ['facing north', 'from due south']],
  ['The sky turns around the pole', ['Face north', 'north celestial pole', 'Polaris', 'North Pole'], ['Face south', 'south celestial pole', 'Sigma Octantis', 'South Pole']],
  ['Why the tilt equals your latitude', ['northern horizon', 'why Polaris'], ['southern horizon', 'why the south celestial pole']],
  ['Equatorial mode', ['northern horizon'], ['southern horizon']],
];
const lesson = (title: string) => LESSONS.findIndex((l) => l.title === title);
const text = (i: number) => renderToStaticMarkup(LESSONS[i].body as ReactElement).replace(/<[^>]+>/g, '');
// The browser tests' fixed time.
const FIXED = Date.UTC(2026, 9, 16, 20);
// Like the real scene, standing on the ground and going to a stop switch the view mode.
const fakeScene = (ms = FIXED) => ({
  standHere: vi.fn(() => settings.set({ mode: 'eye' })), goTo: vi.fn(() => settings.set({ mode: 'orbit' })), faceSiteMeridian: vi.fn(), getTime: () => ms,
});
const home = settings.get();
afterAll(() => settings.set(home));

describe.each([['Greenwich', 51.48, 0], ['Sydney', -33.87, 1]] as const)('guide at %s', (_place, lat, side) => {
  it.each(HEMISPHERE_WORDS)('%s names the right hemisphere', (title, ...words) => {
    settings.set({ lat: (lat * Math.PI) / 180 });
    const t = text(lesson(title));
    for (const w of words[side]) expect(t).toContain(w);
    for (const w of words[1 - side]) expect(t).not.toContain(w);
  });

  it('faces the pole and the equator the right way, and targets the pole star', () => {
    settings.set({ lat: (lat * Math.PI) / 180 });
    const meridian = fakeScene(), pole = fakeScene();
    applyLesson(lesson('The meridian'), meridian as unknown as SceneApi);
    applyLesson(lesson('The sky turns around the pole'), pole as unknown as SceneApi);
    // Yaw 0 faces south and 180 north (Scene.standHere).
    expect(meridian.standHere).toHaveBeenCalledWith(side ? 180 : 0, 30);
    expect(pole.standHere).toHaveBeenCalledWith(side ? 0 : 180, 36);
    expect(TARGETS[settings.get().target][0]).toBe(side ? 'Sigma Octantis' : 'Polaris');
  });
});

// Altitude in degrees of the current target, which must be a star.
const targetAlt = (ms: number) => {
  const { target, lat, lon } = settings.get(), [, ra, dec] = TARGETS[target];
  return horizontal(ra! * D2R, dec! * D2R, ms, lat, lon).alt * R2D;
};
const VEGA_STEPS = ['Alt-az mode', 'Equatorial mode', 'What tracking does', 'Other designs: Dobsonian'];

describe.each(VEGA_STEPS)('%s', (title) => {
  it('targets Vega from Greenwich', () => {
    settings.set({ lat: 51.48 * D2R, lon: 0 });
    applyLesson(lesson(title), fakeScene() as unknown as SceneApi);
    expect(TARGETS[settings.get().target][0]).toBe('Vega');
  });

  it('targets a star well up from Sydney, at the fixed time and on every evening of the year', () => {
    settings.set({ lat: -33.9 * D2R, lon: 151.2 * D2R });
    applyLesson(lesson(title), fakeScene() as unknown as SceneApi);
    expect(targetAlt(FIXED)).toBeGreaterThan(60);
    for (let m = 0; m < 12; m++) {
      const ms = Date.UTC(2026, m, 16, 11); // 21:00 in Sydney
      applyLesson(lesson(title), fakeScene(ms) as unknown as SceneApi);
      expect(targetAlt(ms), `month ${m + 1}`).toBeGreaterThan(15);
    }
  });
});

it.each([['Greenwich', 51.48, 0, 'Vega'], ['Sydney', -33.9, 151.2, 'Canopus']] as const)('What tracking does names the target at %s', (_place, lat, lon, star) => {
  settings.set({ lat: lat * D2R, lon: lon * D2R });
  applyLesson(lesson('What tracking does'), fakeScene() as unknown as SceneApi);
  const t = text(lesson('What tracking does'));
  expect(t).toContain(`so ${star} drifts`);
  expect(t).toContain(`bring ${star} back`);
  if (star !== 'Vega') expect(t).not.toContain('Vega');
});

describe('changing place with a step open', () => {
  const GREENWICH = [51.48 * D2R, 0], QUITO = [-0.18 * D2R, -78.47 * D2R], SYDNEY = [-33.87 * D2R, 151.21 * D2R], MAUNA_KEA = [19.82 * D2R, -155.47 * D2R];
  const moveTo = ([lat, lon]: number[]) => settings.set({ lat, lon });
  const name = () => TARGETS[settings.get().target][0];
  let unfollow = () => {};
  afterEach(() => unfollow());
  // Opens a step at a place, then follows the hemisphere with only later calls on the scene recorded.
  const open = (title: string, place: number[]) => {
    unfollow();
    moveTo(place);
    const scene = fakeScene();
    applyLesson(lesson(title), scene as unknown as SceneApi);
    vi.clearAllMocks();
    unfollow = followHemisphere(scene as unknown as SceneApi);
    return scene;
  };

  it('turns the pole step round and swaps its pole star on crossing the equator, both ways', () => {
    const scene = open('The sky turns around the pole', GREENWICH);
    moveTo(QUITO);
    expect(scene.standHere).toHaveBeenLastCalledWith(0, 36);
    expect(name()).toBe('Sigma Octantis');
    moveTo(GREENWICH);
    expect(scene.standHere).toHaveBeenLastCalledWith(180, 36);
    expect(name()).toBe('Polaris');
    expect(scene.standHere).toHaveBeenCalledTimes(2);
  });

  it('swaps Vega for a southern star on crossing the equator, both ways, without moving the camera', () => {
    const scene = open('Alt-az mode', GREENWICH);
    moveTo(SYDNEY);
    expect(['Canopus', 'Alpha Centauri']).toContain(name());
    moveTo(GREENWICH);
    expect(name()).toBe('Vega');
    expect(scene.goTo).not.toHaveBeenCalled();
    expect(scene.standHere).not.toHaveBeenCalled();
  });

  it('turns the meridian step round on crossing the equator', () => {
    const scene = open('The meridian', SYDNEY);
    moveTo(GREENWICH);
    expect(scene.standHere).toHaveBeenCalledWith(0, 30);
  });

  it('re-aims nothing while staying in one hemisphere', () => {
    const scene = open('The sky turns around the pole', GREENWICH);
    moveTo(MAUNA_KEA);
    moveTo([0, 0]); // the equator counts as north, as in the text
    expect(scene.standHere).not.toHaveBeenCalled();
    expect(name()).toBe('Polaris');
    const south = open('The sky turns around the pole', SYDNEY);
    moveTo(QUITO);
    expect(south.standHere).not.toHaveBeenCalled();
    expect(name()).toBe('Sigma Octantis');
  });

  it('keeps a target the user chose and a view they left', () => {
    open('Alt-az mode', GREENWICH);
    settings.set({ target: TARGETS.findIndex((t) => t[0] === 'Sirius') });
    moveTo(SYDNEY);
    expect(name()).toBe('Sirius');
    const scene = open('The meridian', GREENWICH);
    settings.set({ mode: 'orbit' });
    moveTo(SYDNEY);
    expect(scene.standHere).not.toHaveBeenCalled();
  });
});
