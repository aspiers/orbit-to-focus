import { forwardRef } from 'react';
import { SPEEDS, STOPS, TARGETS } from '../constants.ts';
import { live, scopeInfo, settings, useStore } from '../store.ts';
import { compassPoint, fmtDeg, fmtHM, fmtSignedHM } from '../format.ts';
import type { SceneApi } from '../scene/Scene.ts';

const R2D = 180 / Math.PI;

export function TimeBar({ scene }: { scene: SceneApi | null }) {
  const clock = useStore(live, (l) => l.clock), lst = useStore(live, (l) => l.lst), sunAlt = useStore(live, (l) => l.sunAlt);
  const speed = useStore(settings, (s) => s.speed);
  return (
    <div id="timebar" role="group" aria-label="Time">
      <span id="clock">{clock}</span>
      <button type="button" onClick={() => settings.set((s) => (s.speed ? { speed: 0, lastSpeed: s.speed } : { speed: s.lastSpeed || 600 }))}>{speed ? 'Pause' : 'Play'}</button>
      <select id="speed" aria-label="Time speed" value={speed} onChange={(e) => settings.set({ speed: +e.target.value })}>
        {SPEEDS.map(([n, v]) => <option key={v} value={v}>{n}</option>)}
      </select>
      <button type="button" onClick={() => scene?.setTime(Date.now())}>Now</button>
      <span className="kv">Sidereal time <b>{fmtHM(lst)}</b></span>
      <span className="kv">Sun altitude <b>{fmtDeg(sunAlt, true)}</b></span>
    </div>
  );
}

const SCALE_NOTES = {
  solar: 'Not to scale. At true scale the Sun would be 12× smaller, Earth a speck 1/1000 of this size, and the Moon 4× farther out.',
  earth: 'The Moon is drawn 4× closer than its true 60 Earth radii. The celestial sphere has no real size: stars are effectively infinitely far away.',
  site: 'The telescope is drawn about 60× larger than true scale against the Earth, so the zoom stays smooth. Stars are at infinite distance.',
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
      <span className="grp"><span className="kv k-eq">RA <b>{fmtHM(l.ra)}</b></span><span className="kv k-eq">Dec <b>{fmtDeg(l.dec, true)}</b></span></span>
      <span className="grp"><span className="kv k-mer">Hour angle <b>{fmtSignedHM(l.ha)}</b></span></span>
      <span className="grp"><span className="kv k-hor">Altitude <b>{fmtDeg(l.alt, true)}</b></span><span className="kv k-hor">Azimuth <b>{(l.az * R2D).toFixed(1)}° {compassPoint(l.az)}</b></span></span>
      <span className="kv">Latitude <b>{Math.abs(lat * R2D).toFixed(1)}° {lat >= 0 ? 'N' : 'S'}</b></span>
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
