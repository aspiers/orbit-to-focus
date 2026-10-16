import { useEffect, useRef, useState } from 'react';
import { createScene, type SceneApi } from '../scene/Scene.ts';
import { applyLesson, LESSONS } from '../lessons.tsx';
import { Panel } from './Panel.tsx';
import { EyeBox, Ladder, Readout, TimeBar } from './Hud.tsx';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null), labels = useRef<HTMLDivElement>(null), eyeview = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLElement>(null), ladder = useRef<HTMLElement>(null);
  const [scene, setScene] = useState<SceneApi | null>(null);

  useEffect(() => {
    const s = createScene(canvas.current!, labels.current!, eyeview.current!);
    setScene(s);
    // A link ending #lesson5 opens that lesson directly.
    const m = /^#lesson(\d+)$/.exec(location.hash);
    applyLesson(m ? Math.min(LESSONS.length, Math.max(1, +m[1])) - 1 : 0, s);
    return s.dispose;
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
      <Ladder scene={scene} ref={ladder} />
      <Readout />
      <EyeBox ref={eyeview} />
    </>
  );
}
