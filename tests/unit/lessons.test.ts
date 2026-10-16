import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { LESSONS, applyLesson } from '../../src/lessons.tsx';
import { settings } from '../../src/store.ts';
import type { SceneApi } from '../../src/scene/Scene.ts';
import { GROUPS } from '../../src/components/Shortcuts.tsx';
import { STOPS, TARGETS, TELESCOPES } from '../../src/constants.ts';

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
    if (l.southTarget) expect(TARGETS.map(([n]) => n)).toContain(l.southTarget);
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
const fakeScene = () => ({ standHere: vi.fn(), goTo: vi.fn(), faceSiteMeridian: vi.fn() });
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
