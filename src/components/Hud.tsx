import { forwardRef, useEffect, useState } from 'react';
import { SPEEDS, STOPS, TARGETS } from '../constants.ts';
import { live, scopeInfo, settings, ui, useStore } from '../store.ts';
import { Modal } from './Modal.tsx';
import { compassPoint, fmtDeg, fmtHM, fmtSignedHM } from '../format.ts';
import type { SceneApi } from '../scene/Scene.ts';

const R2D = 180 / Math.PI;

// Speeds are signed: negative runs time backwards. Paused keeps the last speed, sign included, in lastSpeed.
const RATES = SPEEDS.map(([, v]) => v).filter((v) => v > 0);
export const togglePause = () => settings.set((s) => (s.speed ? { speed: 0, lastSpeed: s.speed } : { speed: s.lastSpeed || 600 }));
export const reverse = () => settings.set((s) => (s.speed ? { speed: -s.speed } : { lastSpeed: -(s.lastSpeed || 600) }));
// Steps through the speed list, keeping the direction; from paused it starts at the last speed.
export const stepSpeed = (dir: 1 | -1) => settings.set((s) => {
  const v = s.speed || s.lastSpeed || 600, i = RATES.findIndex((r) => r >= Math.abs(v));
  return { speed: Math.sign(v) * RATES[Math.min(RATES.length - 1, Math.max(0, (i < 0 ? RATES.length - 1 : i) + dir))] };
});
export function TimeBar({ scene }: { scene: SceneApi | null }) {
  const clock = useStore(live, (l) => l.clock), lst = useStore(live, (l) => l.lst), sunAlt = useStore(live, (l) => l.sunAlt);
  const speed = useStore(settings, (s) => s.speed), backwards = useStore(settings, (s) => (s.speed || s.lastSpeed) < 0);
  return (
    <div id="timebar" role="group" aria-label="Time">
      <button type="button" id="clock" title="Set the date and time (T)" onClick={() => ui.set({ dialog: 'time' })}>{clock}</button>
      <button type="button" title="Jump to now (N)" onClick={() => scene?.setTime(Date.now())}>Now</button>
      <button type="button" title="Slower ( [ )" aria-label="Slower" onClick={() => stepSpeed(-1)}>«</button>
      <button type="button" className="fixed-w" title="Pause or play (Space)" onClick={togglePause}>{speed ? 'Pause' : 'Play'}</button>
      <button type="button" title="Faster ( ] )" aria-label="Faster" onClick={() => stepSpeed(1)}>»</button>
      <select id="speed" aria-label="Time speed" value={Math.abs(speed)} onChange={(e) => settings.set((s) => ({ speed: ((s.speed || s.lastSpeed) < 0 ? -1 : 1) * +e.target.value }))}>
        {SPEEDS.map(([n, v]) => <option key={v} value={v}>{n}</option>)}
      </select>
      <button type="button" title="Run time backwards ( \ )" className="fixed-w wide" aria-pressed={backwards} onClick={reverse}>{backwards ? '◀ Backwards' : 'Forwards ▶'}</button>
      <span className="kv">Sidereal time <b>{fmtHM(lst)}</b></span>
      <span className="kv">Sun altitude <b className="w6">{fmtDeg(sunAlt, true)}</b></span>
      <TimeDialog scene={scene} />
    </div>
  );
}

// Date and time in UTC, matching the clock.
function TimeDialog({ scene }: { scene: SceneApi | null }) {
  const open = useStore(ui, (u) => u.dialog === 'time');
  const [draft, setDraft] = useState('');
  useEffect(() => { if (open && scene) setDraft(new Date(scene.getTime()).toISOString().slice(0, 16)); }, [open, scene]);
  const close = () => ui.set({ dialog: null });
  return (
    <Modal open={open} title="Date and time">
      <form onSubmit={(e) => { e.preventDefault(); const t = Date.parse(`${draft}:00Z`); if (Number.isFinite(t)) scene?.setTime(t); close(); }}>
        <label>UTC <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)} required data-autofocus /></label>
        <div className="dialog-buttons">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" className="primary">Set</button>
        </div>
      </form>
    </Modal>
  );
}

const SCALE_NOTES = {
  solar: 'Not to scale. At true scale the Sun would be 12× smaller, Earth a speck 1/1000 of this size, and the Moon 4× farther out.',
  earth: 'The Moon is drawn 4× closer than its true 60 Earth radii. The telescope tube is hugely oversized so you can see where it points. The celestial sphere has no real size: stars are effectively infinitely far away.',
  site: 'The telescope is drawn about 60× larger than true scale against the Earth, so the zoom stays smooth, and its tube grows further as you zoom out so it stays visible. Stars are at infinite distance.',
  optics: 'Optics to scale in millimetres. Rays are traced through one slice of the tube.',
};

export const Ladder = forwardRef<HTMLElement, { scene: SceneApi | null }>(function Ladder({ scene }, ref) {
  const stop = useStore(live, (l) => l.stop);
  const band = stop === 'solar' ? 'solar' : stop === 'moon' || stop === 'earth' ? 'earth' : stop === 'optics' || stop === 'focus' ? 'optics' : 'site';
  return (
    <nav id="ladder" aria-label="Zoom to scale" ref={ref}>
      {STOPS.map((s) => (
        <button type="button" key={s.id} aria-current={stop === s.id} onClick={() => scene?.goTo(s.id)}>
          <span>{s.name}</span><small>{s.hint}</small>
        </button>
      ))}
      <button type="button" className="eye-btn" aria-current={stop === 'eye'} onClick={() => (stop === 'eye' ? scene?.goTo('site') : scene?.standHere(0, 30))}>
        <span>Stand here</span><small>look at the sky</small>
      </button>
      <div id="scaleNote">{SCALE_NOTES[band]}</div>
    </nav>
  );
});

export function Readout() {
  const l = useStore(live, (x) => x);
  const name = useStore(settings, (s) => TARGETS[s.target][0]);
  const lat = useStore(settings, (s) => s.lat);
  return (
    <div id="readout" aria-label="Target coordinates">
      <span className="name">{name === 'Custom' ? 'Custom target' : name}</span>
      <span className="grp"><span className="kv k-eq">RA <b>{fmtHM(l.ra)}</b></span><span className="kv k-eq">Dec <b className="w6">{fmtDeg(l.dec, true)}</b></span></span>
      <span className="grp"><span className="kv k-mer">Hour angle <b className="w8">{fmtSignedHM(l.ha)}</b></span></span>
      <span className="grp"><span className="kv k-hor">Altitude <b className="w6">{fmtDeg(l.alt, true)}</b></span><span className="kv k-hor">Azimuth <b className="w6">{(l.az * R2D).toFixed(1)}°</b> <b className="w2 left">{compassPoint(l.az)}</b></span></span>
      <span className="kv">Latitude <b className="w5">{Math.abs(lat * R2D).toFixed(1)}°</b> <b>{lat >= 0 ? 'N' : 'S'}</b></span>
      {l.alt <= 0 && <span id="rHorizon">Below your horizon</span>}
    </div>
  );
}

export const EyeBox = forwardRef<HTMLCanvasElement>(function EyeBox(_, ref) {
  const info = useStore(scopeInfo, (s) => s);
  const sunInView = useStore(live, (l) => l.sunInView);
  const f = info.focalLength / info.aperture;
  return (
    <div id="eyebox">
      <div id="eyeTitle">{info.sensor ? 'Camera view' : 'Eyepiece view'}</div>
      <canvas ref={ref} width={392} height={392} />
      <div id="eyeCaption">
        {info.field
          ? `${info.field[0].toFixed(2)}° × ${info.field[1].toFixed(2)}° field · ${info.focalLength.toFixed(0)} mm f/${f.toFixed(1)}`
          : `${info.magnification?.toFixed(0)}× with a 25 mm eyepiece · ${info.trueField?.toFixed(2)}° field`}
      </div>
      {sunInView && <div id="sunWarn">The Sun is in view. Never point a telescope at the Sun without a proper solar filter.</div>}
    </div>
  );
});
