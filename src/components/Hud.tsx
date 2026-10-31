import { forwardRef, useEffect, useRef, useState } from 'react';
import { SPEEDS, STOPS, TARGETS } from '../constants.ts';
import { reverse, stepSpeed, togglePause } from '../time.ts';
import { live, scopeInfo, settings, ui, useStore } from '../store.ts';
import { copyLink } from '../url.ts';
import { Modal } from './Modal.tsx';
import { compassPoint, fmtDeg, fmtHM, fmtSignedHM } from '../format.ts';
import type { SceneApi } from '../scene/Scene.ts';

const R2D = 180 / Math.PI;

// In the panel's header on larger screens, and in the time bar's popover on phones: in the bar itself it would cost
// the bar another row at common laptop widths.
export function CopyLink({ id }: { id?: string }) {
  const copied = useStore(ui, (u) => u.copied);
  return <button type="button" id={id} title="Copy a link to this view, without your location (U)" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>;
}

export function TimeBar({ scene }: { scene: SceneApi | null }) {
  const clock = useStore(live, (l) => l.clock), lst = useStore(live, (l) => l.lst), sunAlt = useStore(live, (l) => l.sunAlt);
  const speed = useStore(settings, (s) => s.speed), backwards = useStore(settings, (s) => (s.speed || s.lastSpeed) < 0);
  const timeOpen = useStore(ui, (u) => u.dialog === 'time');
  const [more, setMore] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  // Phones fold Now, the direction, the two readings and Copy link into a popover; a tap elsewhere or Escape closes it.
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setMore(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMore(false); document.getElementById('moreBtn')?.focus(); } };
    addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    return () => { removeEventListener('pointerdown', onDown); removeEventListener('keydown', onKey); };
  }, [more]);
  const now = (c: string) => <button type="button" className={c} title="Jump to now (N)" onClick={() => { scene?.setTime(Date.now()); setMore(false); }}>Now</button>;
  const direction = (c: string) => (
    <button type="button" title="Run time backwards ( \ )" className={`fixed-w wide ${c}`} aria-pressed={backwards} onClick={reverse}>
      {backwards ? <><i aria-hidden="true">◀</i> <span className="word">Backwards</span></> : <><span className="word">Forwards</span> <i aria-hidden="true">▶</i></>}
    </button>
  );
  const readings = (c: string) => (
    <span className={`readings ${c}`}>
      <span className="kv">Sidereal<span className="long"> time</span> <b>{fmtHM(lst)}</b></span>
      <span className="kv">Sun alt<span className="long">itude</span> <b className="w6">{fmtDeg(sunAlt, true)}</b></span>
    </span>
  );
  // The dialog sits outside the bar: the bar's backdrop blur would make it the dialog's positioning frame.
  return (
    <>
    <div id="timebar" role="group" aria-label="Time" ref={bar}>
      <button type="button" id="clock" title="Set the date and time (T)" aria-expanded={timeOpen} onClick={() => ui.set((u) => ({ dialog: u.dialog === 'time' ? null : 'time' }))}>
        {/* The date and time take a line each on phones. */}
        <span className="clock-date">{clock.slice(0, 10)}</span> <span>{clock.slice(11)}</span>
      </button>
      {now('desk')}
      <button type="button" title="Slower ( [ )" aria-label="Slower" onClick={() => stepSpeed(-1)}>«</button>
      <button type="button" className="fixed-w" title="Pause or play (Space)" onClick={togglePause}>{speed ? 'Pause' : 'Play'}</button>
      <button type="button" title="Faster ( ] )" aria-label="Faster" onClick={() => stepSpeed(1)}>»</button>
      <select id="speed" aria-label="Time speed" value={Math.abs(speed)} onChange={(e) => settings.set((s) => ({ speed: ((s.speed || s.lastSpeed) < 0 ? -1 : 1) * +e.target.value }))}>
        {SPEEDS.map(([n, v]) => <option key={v} value={v}>{n}</option>)}
      </select>
      {direction('desk')}
      {readings('desk')}
      <button type="button" id="moreBtn" title="More controls" aria-label="More controls" aria-expanded={more} aria-controls="moreTime" onClick={() => setMore(!more)}>⋯</button>
      {more && <div id="moreTime" role="group" aria-label="More controls">{now('')}{direction('')}<CopyLink />{readings('')}</div>}
    </div>
    <TimeDialog scene={scene} />
    </>
  );
}

// Date and time in UTC, matching the clock.
function TimeDialog({ scene }: { scene: SceneApi | null }) {
  const open = useStore(ui, (u) => u.dialog === 'time');
  const [draft, setDraft] = useState('');
  useEffect(() => { if (open && scene) setDraft(new Date(scene.getTime()).toISOString().slice(0, 16)); }, [open, scene]);
  const close = () => ui.set({ dialog: null });
  return (
    <Modal open={open} title="Date and time" anchor="#clock">
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
  const nav = useRef<HTMLElement | null>(null);
  const setRef = (e: HTMLElement | null) => { nav.current = e; if (typeof ref === 'function') ref(e); else if (ref) ref.current = e; };
  // Where the strip on phones is cut off, its edge fades; styles.css reads these.
  const edges = () => {
    const n = nav.current!;
    n.dataset.l = n.scrollLeft > 4 ? '1' : '';
    n.dataset.r = n.scrollLeft + n.clientWidth < n.scrollWidth - 4 ? '1' : '';
  };
  useEffect(() => {
    const n = nav.current!, ro = new ResizeObserver(edges);
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  // Bring the current stop to the middle of the strip, which is a column that never scrolls on larger screens.
  useEffect(() => {
    const n = nav.current!, b = n.querySelector<HTMLElement>('[aria-current=true]');
    if (b && n.scrollWidth > n.clientWidth) n.scrollLeft = b.offsetLeft - (n.clientWidth - b.offsetWidth) / 2;
    edges();
  }, [stop]);
  return (
    <nav id="ladder" aria-label="Zoom to scale" ref={setRef} onScroll={edges}>
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
  // Phones show the name, altitude and azimuth on one row; a tap on it opens the rest.
  const [open, setOpen] = useState(false);
  return (
    <div id="readout" aria-label="Target coordinates" className={`${open ? 'open' : ''} ${l.alt <= 0 ? 'below' : ''}`}>
      <div className="title"><span className="name">{name === 'Custom' ? 'Custom target' : name}</span>{l.alt <= 0 && <span id="rHorizon">Below your horizon</span>}</div>
      <span className="grp extra"><span className="kv k-eq">RA <b>{fmtHM(l.ra)}</b></span><span className="kv k-eq">Dec <b className="w6">{fmtDeg(l.dec, true)}</b></span></span>
      <span className="grp extra"><span className="kv k-mer">Hour angle <b className="w8">{fmtSignedHM(l.ha)}</b></span></span>
      <span className="grp main"><span className="kv k-hor">Alt<span className="long">itude</span> <b className="w6 alt">{fmtDeg(l.alt, true)}</b></span><span className="kv k-hor">Az<span className="long">imuth</span> <b className="w6">{(l.az * R2D).toFixed(1)}°</b> <b className="w2 left">{compassPoint(l.az)}</b></span></span>
      <span className="kv extra">Latitude <b className="w5">{Math.abs(lat * R2D).toFixed(1)}°</b> <b>{lat >= 0 ? 'N' : 'S'}</b></span>
      <i className="brk" aria-hidden="true" />
      <button type="button" id="readoutMore" title="More coordinates" aria-label="More coordinates" aria-expanded={open} onClick={() => setOpen(!open)}><i aria-hidden="true">{open ? '▴' : '▾'}</i></button>
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
      <canvas ref={ref} width={392} height={392} title="Drag to steer the telescope" />
      <div id="eyeCaption">
        {info.field
          ? `${info.field[0].toFixed(2)}° × ${info.field[1].toFixed(2)}° field · ${info.focalLength.toFixed(0)} mm f/${f.toFixed(1)}`
          : `${info.magnification?.toFixed(0)}× with a 25 mm eyepiece · ${info.trueField?.toFixed(2)}° field`}
      </div>
      {sunInView && <div id="sunWarn">The Sun is in view. Never point a telescope at the Sun without a proper solar filter.</div>}
    </div>
  );
});
