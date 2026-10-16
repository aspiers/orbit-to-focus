import { useEffect } from 'react';
import { STOPS } from '../constants.ts';
import { LESSONS, applyLesson } from '../lessons.tsx';
import { live, settings, ui, useStore, type LayerId } from '../store.ts';
import type { SceneApi } from '../scene/Scene.ts';
import { reverse, stepSpeed, togglePause } from '../time.ts';
import { Modal } from './Modal.tsx';

interface Shortcut { keys: string[]; label: string; run?: (scene: SceneApi) => void }

const toggleLayer = (id: LayerId) => () => settings.set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } }));
const goLesson = (scene: SceneApi, i: number) => {
  applyLesson(Math.min(LESSONS.length - 1, Math.max(0, i)), scene);
  settings.set({ tab: 'guide' });
};
// STOPS run from the solar system inwards, so +1 zooms in.
const zoomStep = (scene: SceneApi, dir: 1 | -1) => {
  const at = live.get().stop, i = at === 'eye' ? STOPS.findIndex((s) => s.id === 'site') : STOPS.findIndex((s) => s.id === at);
  scene.goTo(STOPS[Math.min(STOPS.length - 1, Math.max(0, i + (at === 'eye' ? 0 : dir)))].id);
};

// Entries without `run` are listed for reference only (handled elsewhere, or typed digits).
export const GROUPS: [string, Shortcut[]][] = [
  ['Time', [
    { keys: ['Space'], label: 'Pause or play', run: togglePause },
    { keys: ['['], label: 'Slower', run: () => stepSpeed(-1) },
    { keys: [']'], label: 'Faster', run: () => stepSpeed(1) },
    { keys: ['\\'], label: 'Run time backwards or forwards', run: reverse },
    { keys: ['N'], label: 'Jump to now', run: (s) => s.setTime(Date.now()) },
    { keys: ['T'], label: 'Set the date and time', run: () => ui.set({ dialog: 'time' }) },
  ]],
  ['Guide', [
    { keys: ['PageDown'], label: 'Next step', run: (s) => goLesson(s, settings.get().lesson + 1) },
    { keys: ['PageUp'], label: 'Previous step', run: (s) => goLesson(s, settings.get().lesson - 1) },
    { keys: ['1', '2', '…'], label: `Type a step number (1–${LESSONS.length}) to jump to it` },
  ]],
  ['View', [
    { keys: ['.'], label: 'Zoom in one stop', run: (s) => zoomStep(s, 1) },
    { keys: [','], label: 'Zoom out one stop', run: (s) => zoomStep(s, -1) },
    { keys: ['V'], label: 'Stand at your site and look at the sky', run: (s) => s.standHere() },
    { keys: ['←', '→', '↑', '↓'], label: 'Orbit or look around (after clicking the view)' },
    { keys: ['+', '−'], label: 'Zoom (after clicking the view)' },
  ]],
  ['Telescope', [
    { keys: ['W'], label: 'Equatorial wedge or alt-az mode', run: () => settings.set((s) => (s.telescope === 'dobsonian' ? {} : { mountMode: s.mountMode === 'eq' ? 'altaz' : 'eq' })) },
    { keys: ['K'], label: 'Track the target on or off', run: () => settings.set((s) => ({ tracking: !s.tracking })) },
    { keys: ['O'], label: 'Corrected or simple optics', run: () => settings.set((s) => ({ corrected: !s.corrected })) },
  ]],
  ['Layers', [
    { keys: ['G'], label: 'See through the ground', run: toggleLayer('ground') },
    { keys: ['L'], label: 'Labels', run: toggleLayer('labels') },
    { keys: ['R'], label: 'Equatorial (RA/Dec) grid', run: toggleLayer('eq') },
    { keys: ['E'], label: 'Ecliptic', run: toggleLayer('ecl') },
    { keys: ['H'], label: 'Horizon and alt-az grid', run: toggleLayer('hor') },
    { keys: ['M'], label: 'Meridian', run: toggleLayer('mer') },
    { keys: ['C'], label: 'Constellation lines', run: toggleLayer('con') },
    { keys: ['A'], label: 'Latitude angles', run: toggleLayer('lat') },
  ]],
  ['Help', [{ keys: ['?'], label: 'Show or hide this list', run: () => ui.set((u) => ({ dialog: u.dialog === 'keys' ? null : 'keys' })) }]],
];

const KEYMAP = new Map<string, (scene: SceneApi) => void>();
for (const [, list] of GROUPS) for (const s of list) if (s.run) for (const k of s.keys) KEYMAP.set(k === 'Space' ? ' ' : k.length === 1 ? k.toLowerCase() : k, s.run);

export function Shortcuts({ scene }: { scene: SceneApi | null }) {
  const open = useStore(ui, (u) => u.dialog === 'keys');
  useEffect(() => {
    if (!scene) return;
    let digits = '', timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Partial<HTMLElement>;
      // Leave typing alone. Keys win over a focused button (Enter still presses it): clicking anything leaves it focused.
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest?.('input, select, textarea')) return;
      const dialog = ui.get().dialog;
      if (dialog && !(dialog === 'keys' && e.key === '?')) return;
      if (/^\d$/.test(e.key)) {
        digits += e.key;
        clearTimeout(timer);
        timer = window.setTimeout(() => { if (+digits >= 1) goLesson(scene, +digits - 1); digits = ''; }, 700);
        return;
      }
      const run = KEYMAP.get(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (!run) return;
      e.preventDefault();
      run(scene);
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [scene]);
  return (
    <Modal open={open} title="Keyboard shortcuts">
      <div className="keys">
        {GROUPS.map(([group, list]) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {list.map((s) => (
                <div key={s.label}><dt>{s.keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt><dd>{s.label}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
