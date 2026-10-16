import { useEffect, useRef, useState } from 'react';
import { createScene, type SceneApi } from '../scene/Scene.ts';
import { applyLesson, LESSONS } from '../lessons.tsx';
import { live, settings } from '../store.ts';
import { decodeState, encodeState } from '../url.ts';
import { locate } from '../geo.ts';
import { Panel } from './Panel.tsx';
import { EyeBox, Ladder, Readout, TimeBar } from './Hud.tsx';
import { Shortcuts } from './Shortcuts.tsx';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null), labels = useRef<HTMLDivElement>(null), eyeview = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLElement>(null), ladder = useRef<HTMLElement>(null);
  const [scene, setScene] = useState<SceneApi | null>(null);

  useEffect(() => {
    const s = createScene(canvas.current!, labels.current!, eyeview.current!);
    setScene(s);
    // The address reopens a guide, then the view, then whatever was changed since (last, so the time
    // speed limit for the view doesn't override a speed in the address).
    const u = decodeState(location.hash);
    // A guide step's view and target can depend on the hemisphere, so the place goes in first.
    if (u.patch.lat !== undefined) settings.set({ lat: u.patch.lat, lon: u.patch.lon });
    applyLesson(Math.min(LESSONS.length - 1, u.lesson ?? 0), s);
    if (u.view === 'eye') s.standHere();
    else if (u.view) s.goTo(u.view);
    settings.set(u.patch);
    // An address with loc= names its place, so only a plain visit asks the browser where the visitor is.
    if (u.patch.lat === undefined) locate();
    return s.dispose;
  }, []);

  // Keep the address in step, replacing the history entry rather than adding one per change.
  useEffect(() => {
    let last = location.hash.replace(/^#/, '');
    const write = () => {
      const h = encodeState(settings.get(), live.get().stop);
      if (h !== last) history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
      last = h;
    };
    const unsubs = [settings.subscribe(write), live.subscribe(write)];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Centre the 3D view in the part of the screen the panels leave uncovered.
  useEffect(() => {
    if (!scene) return;
    const update = () => {
      const p = panel.current!.getBoundingClientRect(), l = ladder.current!.getBoundingClientRect();
      if (innerWidth > 860) scene.setViewShift((p.right - (innerWidth - l.left)) / 2, 0);
      else scene.setViewShift(0, (innerHeight - p.top - 110) / 2);
    };
    const ro = new ResizeObserver(update);
    ro.observe(panel.current!); ro.observe(document.body);
    update();
    return () => ro.disconnect();
  }, [scene]);

  return (
    <>
      <canvas id="view" ref={canvas} tabIndex={0} aria-label="3D view. Drag to orbit, scroll or pinch to zoom, arrow keys to orbit." />
      <div id="labels" ref={labels} aria-hidden="true" />
      <Panel scene={scene} ref={panel} />
      <TimeBar scene={scene} />
      <Shortcuts scene={scene} />
      <Ladder scene={scene} ref={ladder} />
      <Readout />
      <EyeBox ref={eyeview} />
    </>
  );
}
