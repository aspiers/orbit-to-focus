// The address bar mirrors the app's state (not the date or time), so a link reopens the same view.
// Only values that differ from the defaults are written, as #key=value&... after the page address.
import { STOPS, TARGETS, TELESCOPES, SENSORS, type StopId } from './constants.ts';
import { live, settings, ui, type LayerId, type Settings, type Tab } from './store.ts';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const DEFAULTS = settings.get();
const LAYER_IDS = Object.keys(DEFAULTS.layers) as LayerId[];
export type View = StopId | 'eye';

const fields = (s: Settings, view: View): Record<string, string> => ({
  lesson: String(s.lesson + 1),
  tab: s.tab,
  view,
  speed: String(s.speed),
  loc: `${+(s.lat * R2D).toFixed(6)},${+(s.lon * R2D).toFixed(6)}`,
  target: TARGETS[s.target][0],
  ...(TARGETS[s.target][1] === null ? { ra: (s.customRa * R2D).toFixed(3), dec: (s.customDec * R2D).toFixed(3) } : {}),
  mount: s.mountMode,
  track: s.tracking ? '1' : '0',
  scope: s.telescope,
  corrected: s.corrected ? '1' : '0',
  focal: String(s.custom.focal),
  aperture: String(s.custom.aperture),
  sensor: s.custom.sensor.map((v) => +v.toFixed(3)).join('x'),
  preset: String(s.sensorPreset),
  layers: LAYER_IDS.filter((id) => s.layers[id]).join(','),
});
const DEFAULT_FIELDS = fields(DEFAULTS, 'solar');

export function encodeState(s: Settings, view: View, withLoc = true) {
  const f = fields(s, view);
  return Object.entries(f).filter(([k, v]) => v !== DEFAULT_FIELDS[k] && (withLoc || k !== 'loc')).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`).join('&');
}

// A link to share leaves out loc=, the viewer's place to about 10 km, so whoever opens it gets their own place.
export function shareLink(s: Settings, view: View, page: string) {
  const h = encodeState(s, view, false);
  return h ? `${page}#${h}` : page;
}

let copiedTimer = 0;
export async function copyLink() {
  const link = shareLink(settings.get(), live.get().stop, location.href.replace(/#.*/, ''));
  try {
    await navigator.clipboard.writeText(link); // no clipboard outside a secure context, or the browser may refuse
  } catch {
    prompt('Copy this link to the view (it leaves out your location):', link);
    return;
  }
  ui.set({ copied: true });
  clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => ui.set({ copied: false }), 1500);
}

// Anything malformed or out of range in the address is ignored rather than trusted.
export function decodeState(hash: string): { lesson?: number; view?: View; patch: Partial<Settings> } {
  const old = /^#lesson(\d+)$/.exec(hash); // links from before the address held settings
  const p = new URLSearchParams(old ? `lesson=${old[1]}` : hash.replace(/^#/, ''));
  const num = (k: string, lo: number, hi: number) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined; };
  const oneOf = <T extends string>(k: string, ok: readonly T[]) => (ok.includes(p.get(k) as T) ? (p.get(k) as T) : undefined);
  const patch: Partial<Settings> = {};
  const set = <K extends keyof Settings>(k: K, v: Settings[K] | undefined) => { if (v !== undefined) patch[k] = v; };

  set('tab', oneOf<Tab>('tab', ['guide', 'scope', 'sky']));
  set('speed', num('speed', -1e7, 1e7));
  const [lat, lon] = (p.get('loc') ?? '').split(',').map(Number);
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { patch.lat = lat * D2R; patch.lon = lon * D2R; }
  const target = TARGETS.findIndex((t) => t[0] === p.get('target'));
  if (target >= 0) patch.target = target;
  const ra = num('ra', 0, 360), dec = num('dec', -90, 90);
  if (ra !== undefined) patch.customRa = ra * D2R;
  if (dec !== undefined) patch.customDec = dec * D2R;
  set('mountMode', oneOf('mount', ['altaz', 'eq'] as const));
  if (p.has('track')) patch.tracking = p.get('track') === '1';
  set('telescope', oneOf('scope', TELESCOPES.map(([id]) => id)));
  if (patch.telescope === 'dobsonian') patch.mountMode = 'altaz'; // a rocker box can't go on a wedge
  if (p.has('corrected')) patch.corrected = p.get('corrected') === '1';
  const focal = num('focal', 100, 1200), aperture = num('aperture', 20, 480);
  const sensor = (p.get('sensor') ?? '').split('x').map(Number);
  const okSensor = sensor.length === 2 && sensor.every((v) => Number.isFinite(v) && v > 0 && v < 100);
  if (focal !== undefined || aperture !== undefined || okSensor) {
    const c = { ...DEFAULTS.custom, ...(focal !== undefined && { focal }), ...(aperture !== undefined && { aperture }), ...(okSensor && { sensor: sensor as [number, number] }) };
    patch.custom = { ...c, aperture: Math.min(c.aperture, Math.floor(c.focal / 2.5)) };
  }
  set('sensorPreset', num('preset', 0, SENSORS.length - 1));
  if (p.has('layers')) {
    const on = new Set(p.get('layers')!.split(','));
    patch.layers = Object.fromEntries(LAYER_IDS.map((id) => [id, on.has(id)])) as Settings['layers'];
  }
  const lesson = num('lesson', 1, 999);
  return { lesson: lesson === undefined ? undefined : Math.floor(lesson) - 1, view: oneOf<View>('view', [...STOPS.map((s) => s.id), 'eye']), patch };
}
