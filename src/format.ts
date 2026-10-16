const R2D = 180 / Math.PI;
const pad = (n: number) => String(n).padStart(2, '0');

export const fmtHM = (rad: number) => {
  const h = ((rad * R2D) / 15 + 24) % 24, hh = Math.floor(h);
  return `${pad(hh)}h ${pad(Math.floor((h - hh) * 60))}m`;
};
export const fmtSignedHM = (rad: number) => {
  const h = Math.abs(rad * R2D) / 15, hh = Math.floor(h);
  return `${rad < 0 ? '−' : '+'}${hh}h ${pad(Math.floor((h - hh) * 60))}m`;
};
export const fmtDeg = (rad: number, signed = false) => {
  const d = rad * R2D;
  return `${signed && d >= 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}°`;
};
export const compassPoint = (az: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((az * R2D) / 45) % 8];
// Ratios: two significant figures below 10, whole numbers above.
export const fmtRatio = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 0.95 ? v.toFixed(1) : v.toFixed(2));
