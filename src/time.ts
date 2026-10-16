import { SPEEDS } from './constants.ts';
import { settings } from './store.ts';

// Speeds are signed: negative runs time backwards. Paused keeps the last speed, sign included, in lastSpeed.
const RATES = SPEEDS.map(([, v]) => v).filter((v) => v > 0);
export const togglePause = () => settings.set((s) => (s.speed ? { speed: 0, lastSpeed: s.speed } : { speed: s.lastSpeed || 600 }));
export const reverse = () => settings.set((s) => (s.speed ? { speed: -s.speed } : { lastSpeed: -(s.lastSpeed || 600) }));
// Steps through the speed list, keeping the direction; from paused it starts at the last speed.
export const stepSpeed = (dir: 1 | -1) => settings.set((s) => {
  const v = s.speed || s.lastSpeed || 600, i = RATES.findIndex((r) => r >= Math.abs(v));
  return { speed: Math.sign(v) * RATES[Math.min(RATES.length - 1, Math.max(0, (i < 0 ? RATES.length - 1 : i) + dir))] };
});
