// The visitor's own location, from the browser when they allow it.
import { PLACES } from './constants.ts';
import { settings } from './store.ts';

const D2R = Math.PI / 180;

// One decimal (about 11 km) changes nothing visible in the sky and keeps a shared link from pinpointing anyone.
export const roundDeg = (d: number) => Math.round(d * 10) / 10;

// The last fix, in rounded degrees, so the place list can show it as "Your location".
export let here: [number, number] | null = null;

// Moves to the visitor's location if the browser shares it. A refusal, an error or a timeout leaves the place
// as it is, and so does a fix that arrives after the visitor has chosen somewhere else.
export function locate() {
  const { lat, lon } = settings.get();
  navigator.geolocation?.getCurrentPosition(({ coords }) => {
    here = [Math.min(89.99, Math.max(-89.99, roundDeg(coords.latitude))), roundDeg(coords.longitude)];
    const s = settings.get();
    if (s.lat === lat && s.lon === lon) settings.set({ lat: here[0] * D2R, lon: here[1] * D2R });
  }, () => {}, { timeout: 15000, maximumAge: 3600000 });
}

// Steps through the places in the order the place list shows them, wrapping round: "Your location" once the
// browser has shared it, then PLACES. Anywhere else, such as a loc= from a link, goes to the first of them.
export function nextPlace(mine = here) {
  const list = [...(mine ? [mine] : []), ...PLACES.map(([, la, lo]) => [la, lo])];
  const { lat, lon } = settings.get();
  const i = list.findIndex(([la, lo]) => Math.abs(la * D2R - lat) < 1e-6 && Math.abs(lo * D2R - lon) < 1e-6);
  const [la, lo] = list[(i + 1) % list.length];
  settings.set({ lat: la * D2R, lon: lo * D2R });
}
