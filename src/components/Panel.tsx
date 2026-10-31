import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { PLACES, SENSORS, TARGETS, TELESCOPES } from '../constants.ts';
import { SEESTAR, type TelescopeType } from '../optics.ts';
import { live, scopeInfo, settings, ui, useStore, type LayerId } from '../store.ts';
import { fmtRatio } from '../format.ts';
import { here, locate } from '../geo.ts';
import { LESSONS, applyLesson } from '../lessons.tsx';
import type { SceneApi } from '../scene/Scene.ts';
import { CopyLink } from './Hud.tsx';
import { ShareButton } from './Share.tsx';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const Panel = forwardRef<HTMLElement, { scene: SceneApi | null }>(function Panel({ scene }, ref) {
  const tab = useStore(settings, (s) => s.tab);
  const [closed, setClosed] = useState(false);
  return (
    <aside id="panel" aria-label="Lessons and controls" ref={ref} className={closed ? 'closed' : ''}>
      <header>
        <h1>Orbit <span>to</span> Focus</h1>
        {/* Below the title on larger screens; on phones it shortens to "Alpha" in the row of tabs. */}
        <button type="button" id="about" title="About this alpha, and how to report a mistake (I)" onClick={() => ui.set({ dialog: 'about' })}>Alpha<span className="long">: feedback welcome</span></button>
        <CopyLink id="copyLink" icon />
        <ShareButton id="shareBtn" icon />
        <button type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => ui.set({ dialog: 'keys' })}>?</button>
        <button type="button" onClick={() => setClosed(!closed)} aria-expanded={!closed}>{closed ? 'Show' : 'Hide'}</button>
      </header>
      <div role="tablist">
        {([['guide', 'Guide'], ['scope', 'Telescope'], ['sky', 'Sky & place']] as const).map(([id, name]) => (
          <button type="button" role="tab" key={id} aria-selected={tab === id} onClick={() => settings.set({ tab: id })}>{name}</button>
        ))}
      </div>
      <section role="tabpanel">
        {tab === 'guide' && <GuideTab scene={scene} />}
        {tab === 'scope' && <TelescopeTab />}
        {tab === 'sky' && <SkyTab scene={scene} />}
      </section>
    </aside>
  );
});

function GuideTab({ scene }: { scene: SceneApi | null }) {
  const i = useStore(settings, (s) => s.lesson);
  const l = LESSONS[i];
  const go = (n: number) => scene && applyLesson(Math.min(LESSONS.length - 1, Math.max(0, n)), scene);
  return (
    <>
      <div className="step">{i + 1} of {LESSONS.length}</div>
      <h2>{l.title}</h2>
      <div id="lessonBody">{l.body}</div>
      <div className="lesson-nav">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
        <button type="button" onClick={() => go(i)}>Show me again</button>
        <button type="button" className="primary" onClick={() => go(i + 1)} disabled={i === LESSONS.length - 1}>Next</button>
      </div>
    </>
  );
}

const CORRECTION: Record<TelescopeType, [string, string]> = {
  seestar: ['ED doublet (corrects colour)', 'Swap in a single ordinary lens to see colour fringing'],
  petzval: ['Achromatic doublets (correct colour)', 'Swap in single lenses to see colour fringing'],
  refractor: ['Achromatic doublet', 'Swap in a single lens to see colour fringing'],
  newtonian: ['Parabolic mirror', 'Swap in a spherical mirror to see spherical aberration'],
  dobsonian: ['Parabolic mirror', 'Swap in a spherical mirror to see spherical aberration'],
  sct: ['Schmidt corrector plate', 'Remove the corrector to see spherical aberration'],
};

function TelescopeTab() {
  const s = useStore(settings, (x) => x);
  const info = useStore(scopeInfo, (x) => x);
  const rateA = useStore(live, (l) => l.rateA), rateB = useStore(live, (l) => l.rateB), offAxis = useStore(live, (l) => l.offAxisDeg);
  const eq = s.mountMode === 'eq';
  const isCam = s.telescope === 'seestar';
  const setLens = (p: Partial<typeof s.custom>) => settings.set((x) => {
    const custom = { ...x.custom, ...p };
    custom.aperture = Math.min(custom.aperture, Math.floor(custom.focal / 2.5));
    return { custom };
  });
  const diag = Math.hypot(...s.custom.sensor);
  const bar = (r: number) => ({ width: `${Math.min(100, (Math.abs(r) / 20) * 100)}%` });
  return (
    <>
      <fieldset>
        <legend>Telescope</legend>
        <div className="row">
          {TELESCOPES.map(([id, name]) => (
            <label key={id}><input type="radio" name="scope" checked={s.telescope === id} onChange={() => settings.set(id === 'dobsonian' ? { telescope: id, mountMode: 'altaz' } : { telescope: id })} /> {name}</label>
          ))}
        </div>
        <div className="facts">
          {info.name} · {info.aperture} mm aperture · {info.nominalFocal} mm focal length · f/{(info.focalLength / info.aperture).toFixed(1)}
          {info.sensor ? ' · camera at the focus' : ` · 25 mm eyepiece gives ${info.magnification?.toFixed(0)}×`}
        </div>
        <div className="row"><label><input type="checkbox" checked={s.corrected} onChange={(e) => settings.set({ corrected: e.target.checked })} /> {CORRECTION[s.telescope][0]}</label></div>
        <div className="hint">{CORRECTION[s.telescope][1]}</div>
      </fieldset>
      <fieldset>
        <legend>Aperture, focal length &amp; sensor</legend>
        {isCam && <>
          <Slider id="focal" label="Focal length" value={s.custom.focal} min={100} max={1200} step={10} out={`${s.custom.focal} mm`} onChange={(v) => setLens({ focal: v })} />
          <Slider id="aperture" label="Aperture (lens diameter)" value={s.custom.aperture} min={20} max={Math.floor(s.custom.focal / 2.5)} step={1} out={`${s.custom.aperture} mm`} onChange={(v) => setLens({ aperture: v })} />
          <div className="row">
            <label htmlFor="sensorPreset">Sensor</label>
            <select id="sensorPreset" value={s.sensorPreset} onChange={(e) => { const p = SENSORS[+e.target.value]; settings.set({ sensorPreset: +e.target.value }); setLens({ sensor: [p[1], p[2]] }); }}>
              {SENSORS.map(([n, a, b], i) => <option key={n} value={i}>{n}: {a} × {b} mm</option>)}
            </select>
          </div>
          <Slider id="sensorSize" label="Sensor diagonal" value={+diag.toFixed(1)} min={4} max={44} step={0.1}
            out={`${diag.toFixed(1)} mm (${s.custom.sensor[0].toFixed(1)} × ${s.custom.sensor[1].toFixed(1)})`}
            onChange={(v) => { const p = SENSORS[s.sensorPreset], k = v / Math.hypot(p[1], p[2]); setLens({ sensor: [p[1] * k, p[2] * k] }); }} />
        </>}
        <Explain />
        {isCam && <button type="button" onClick={() => settings.set({ custom: SEESTAR, sensorPreset: 0 })}>Reset to the default (Seestar S50 Pro)</button>}
      </fieldset>
      <fieldset>
        <legend>Point at</legend>
        <div className="row">
          <select aria-label="Target" value={s.target} onChange={(e) => settings.set({ target: +e.target.value })}>
            {TARGETS.map(([n], i) => <option key={n} value={i}>{n === 'Custom' ? 'Custom RA/Dec…' : n}</option>)}
          </select>
        </div>
        {TARGETS[s.target][0] === 'Custom' && (
          <div className="row">
            <label>RA (hours) <input type="number" min={0} max={24} step={0.1} defaultValue={((s.customRa * R2D) / 15).toFixed(1)} onChange={(e) => settings.set({ customRa: Math.min(24, Math.max(0, +e.target.value || 0)) * 15 * D2R })} /></label>
            <label>Dec (°) <input type="number" min={-90} max={90} step={0.5} defaultValue={(s.customDec * R2D).toFixed(1)} onChange={(e) => settings.set({ customDec: Math.min(90, Math.max(-90, +e.target.value || 0)) * D2R })} /></label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Mount</legend>
        <div className="row">
          <label><input type="radio" name="mount" checked={!eq} onChange={() => settings.set({ mountMode: 'altaz' })} /> Alt-az mode</label>
          <label><input type="radio" name="mount" checked={eq} disabled={s.telescope === 'dobsonian'} onChange={() => settings.set({ mountMode: 'eq' })} /> Equatorial mode (on a wedge)</label>
        </div>
        {s.telescope === 'dobsonian' && <p className="hint">A Dobsonian’s rocker box only turns in altitude and azimuth.</p>}
        <div className="row">
          <label><input type="checkbox" checked={s.tracking} onChange={(e) => settings.set({ tracking: e.target.checked })} /> Track the target</label>
          <span className="kv">{offAxis < 0.01 ? 'on axis' : offAxis < 1 ? `${(offAxis * 60).toFixed(1)}′ off axis` : `${offAxis.toFixed(1)}° off axis`}</span>
        </div>
        <div className="rate">
          <span>{eq ? 'RA axis (turntable)' : 'Azimuth axis (turntable)'}</span><b>{Math.abs(rateA).toFixed(1)}°/h</b><span className="bar"><i style={bar(rateA)} /></span>
          <span>{eq ? 'Dec axis (arm)' : 'Altitude axis (arm)'}</span><b>{Math.abs(rateB).toFixed(1)}°/h</b><span className="bar"><i style={bar(rateB)} /></span>
        </div>
        <p className="hint">Speeds needed to follow the target, in degrees per hour of sky time.</p>
      </fieldset>
    </>
  );
}

function Slider(p: { id: string; label: string; value: number; min: number; max: number; step: number; out: string; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <label htmlFor={p.id}>{p.label}</label><output htmlFor={p.id}>{p.out}</output>
      <input type="range" id={p.id} value={p.value} min={p.min} max={p.max} step={p.step} onChange={(e) => p.onChange(+e.target.value)} />
    </div>
  );
}

// What the numbers mean, worked out for the current telescope.
function Explain() {
  const info = useStore(scopeInfo, (x) => x);
  const F = info.nominalFocal, D = info.aperture, N = F / D;
  const cone = 2 * Math.atan(1 / (2 * N)) * R2D;
  const seestarN = SEESTAR.focal / SEESTAR.aperture;
  return (
    <div className="explain" aria-live="polite">
      <p><b>f/{N.toFixed(1)}</b> is the <strong>focal ratio</strong>, or f-number: focal length ÷ aperture = {F} mm ÷ {D} mm. It sets how steep the cone of light is as it converges on the focus: here it is {cone.toFixed(0)}° wide.</p>
      {info.sensor && info.field ? <>
        <p>A smaller f-number means a fatter cone, so each pixel gets more light and a faint nebula needs less exposure. This setup needs <b>{fmtRatio((N / seestarN) ** 2)}×</b> the exposure of an f/{seestarN.toFixed(1)} telescope (such as the default Seestar S50 Pro) for the same nebula. Stars are points, so for them the aperture matters more than the f-number.</p>
        <p><strong>Aperture</strong> sets how much light is collected in total, <b>{fmtRatio((D / SEESTAR.aperture) ** 2)}×</b> that of a {SEESTAR.aperture} mm lens like the default Seestar’s, and the finest detail the lens can separate: about <b>{(116 / D).toFixed(1)}″</b>.</p>
        <p><strong>Focal length and sensor size</strong> set the field of view: <b>{info.field[0].toFixed(2)}° × {info.field[1].toFixed(2)}°</b>. The full Moon is 0.5° across. Each 2.9 µm pixel covers <b>{((206.265 * 2.9) / F).toFixed(1)}″</b> of sky.</p>
      </> : (
        <p>With an eyepiece, the focal length sets the magnification ({F} mm ÷ 25 mm = <b>{info.magnification?.toFixed(0)}×</b>) and the aperture sets how faint you can see and how fine the detail: about <b>{(116 / D).toFixed(1)}″</b>.</p>
      )}
    </div>
  );
}

const LAYERS: [LayerId, string, string?][] = [
  ['eq', 'Equatorial grid (RA/Dec), celestial equator and poles', 'var(--eq)'], ['ecl', 'Ecliptic', 'var(--ecl)'],
  ['hor', 'Horizon and alt-az grid', 'var(--hor)'], ['mer', 'Meridian', 'var(--mer)'], ['moonOrbit', 'Moon’s orbit', 'var(--moon)'],
  ['lat', 'Why the polar axis tilts by your latitude', '#fff'], ['con', 'Constellation lines'], ['names', 'Names'], ['labels', 'Labels'],
  ['ground', 'See through the ground'],
];

function SkyTab({ scene }: { scene: SceneApi | null }) {
  const s = useStore(settings, (x) => x);
  const at = (la: number, lo: number) => Math.abs(la * D2R - s.lat) < 1e-6 && Math.abs(lo * D2R - s.lon) < 1e-6;
  const place = here && at(...here) ? 'here' : String(PLACES.findIndex(([, la, lo]) => at(la, lo))).replace('-1', '');
  const setLoc = (la: number, lo: number) => settings.set({ lat: Math.min(89.99, Math.max(-89.99, la)) * D2R, lon: lo * D2R });
  return (
    <>
      <fieldset>
        <legend>Show</legend>
        {LAYERS.map(([id, name, color]) => (
          <div className="row" key={id}>
            <label><input type="checkbox" checked={s.layers[id]} onChange={(e) => settings.set({ layers: { ...s.layers, [id]: e.target.checked } })} />
              {color && <i className="chip" style={{ background: color }} />} {name}</label>
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Where you are</legend>
        <div className="row">
          <label>Latitude <NumField min={-90} max={90} step={0.0001} value={s.lat * R2D} onValue={(v) => setLoc(v, s.lon * R2D)} /></label>
          <label>Longitude <NumField min={-180} max={180} step={0.0001} value={s.lon * R2D} onValue={(v) => setLoc(s.lat * R2D, v)} /></label>
        </div>
        <div className="row">
          <select aria-label="Choose a place" value={place} onChange={(e) => { if (e.target.value === 'here') return locate(); const p = PLACES[+e.target.value]; if (p) setLoc(p[1], p[2]); }}>
            <option value="" disabled>Other place</option>
            <option value="here">Your location{here && ` (${here[0].toFixed(1)}, ${here[1].toFixed(1)})`}</option>
            {PLACES.map(([n, la, lo], i) => <option key={n} value={i}>{n} ({la.toFixed(2)}, {lo.toFixed(2)})</option>)}
          </select>
        </div>
        <p className="hint">Positive latitude is north, positive longitude is east.</p>
      </fieldset>
      <fieldset>
        <legend>Date and time (UTC)</legend>
        <div className="row"><input type="datetime-local" aria-label="Set date and time in UTC" onChange={(e) => { const t = Date.parse(e.target.value + 'Z'); if (!isNaN(t)) scene?.setTime(t); }} /></div>
      </fieldset>
    </>
  );
}

// A number box you can type into freely: it follows outside changes (a place picked, a link opened) except while
// you're typing in it, and reports each valid number as you type.
function NumField({ value, onValue, ...rest }: { value: number; onValue: (v: number) => void } & InputHTMLAttributes<HTMLInputElement>) {
  const [text, setText] = useState(value.toFixed(4));
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setText(value.toFixed(4)); }, [value]);
  return (
    <input type="number" {...rest} value={text}
      onFocus={() => { typing.current = true; }}
      onBlur={() => { typing.current = false; setText(value.toFixed(4)); }}
      onChange={(e) => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v)) onValue(v); }} />
  );
}
