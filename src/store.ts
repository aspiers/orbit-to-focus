import { useSyncExternalStore } from 'react';
import type { CameraSpec, TelescopeType } from './optics.ts';
import { SEESTAR } from './optics.ts';
import { PLACES, type StopId } from './constants.ts';

export type LayerId = 'eq' | 'ecl' | 'hor' | 'mer' | 'con' | 'names' | 'moonOrbit' | 'ground' | 'labels' | 'lat';
export type Layers = Record<LayerId, boolean>;
export type Tab = 'guide' | 'scope' | 'sky';

// What the user (or a lesson) has chosen. The scene reads it every frame.
export interface Settings {
  speed: number; lastSpeed: number;
  lat: number; lon: number; // radians
  target: number; customRa: number; customDec: number; // radians
  mountMode: 'altaz' | 'eq'; tracking: boolean;
  telescope: TelescopeType; corrected: boolean; custom: CameraSpec; sensorPreset: number;
  layers: Layers; lesson: number; mode: 'orbit' | 'eye'; tab: Tab;
}

// What the scene reports back for the panels, refreshed a few times a second.
export interface Live {
  clock: string; lst: number; sunAlt: number;
  ra: number; dec: number; ha: number; alt: number; az: number;
  rateA: number; rateB: number; offAxisDeg: number; stop: StopId | 'eye'; sunInView: boolean;
}

export interface ScopeInfo {
  name: string; aperture: number; focalLength: number; nominalFocal: number; sensor?: [number, number];
  field?: [number, number]; magnification?: number; trueField?: number;
}

export interface Store<T> { get(): T; set(p: Partial<T> | ((s: T) => Partial<T>)): void; subscribe(f: () => void): () => void }

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; subs.forEach((f) => f()); },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

// Selectors must return primitives or objects the store keeps by reference, or React re-renders forever.
// The same snapshot serves server rendering, which the guide's unit tests use.
export const useStore = <T, U>(store: Store<T>, select: (s: T) => U) => {
  const get = () => select(store.get());
  return useSyncExternalStore(store.subscribe, get, get);
};

const D2R = Math.PI / 180;
// Greenwich Observatory until the browser says where the visitor is (see geo.ts).
const [, LAT0, LON0] = PLACES[0];
export const settings = createStore<Settings>({
  speed: 1, lastSpeed: 60, lat: LAT0 * D2R, lon: LON0 * D2R,
  target: 0, customRa: 0, customDec: 0, mountMode: 'altaz', tracking: true,
  telescope: 'seestar', corrected: true, custom: SEESTAR, sensorPreset: 0,
  layers: { eq: true, ecl: true, hor: true, mer: true, con: true, names: true, moonOrbit: true, ground: false, labels: true, lat: false },
  lesson: 0, mode: 'orbit', tab: 'guide',
});

export const live = createStore<Live>({
  clock: '', lst: 0, sunAlt: 0, ra: 0, dec: 0, ha: 0, alt: 0, az: 0, rateA: 0, rateB: 0, offAxisDeg: 0, stop: 'solar', sunInView: false,
});

// Which dialog is open, if any, and whether a link to the view was just copied.
export const ui = createStore<{ dialog: 'time' | 'keys' | 'about' | null; copied: boolean }>({ dialog: null, copied: false });

export const scopeInfo = createStore<ScopeInfo>({ name: '', aperture: 0, focalLength: 0, nominalFocal: 0 });
