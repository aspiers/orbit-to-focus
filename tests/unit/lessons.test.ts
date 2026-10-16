import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/lessons.tsx';
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
