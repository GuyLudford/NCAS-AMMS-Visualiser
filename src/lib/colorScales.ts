// Hand-rolled tiny viridis-like ramp (no d3 dependency for now).
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
const PLASMA: [number, number, number][] = [
  [13, 8, 135],
  [126, 3, 168],
  [203, 71, 119],
  [248, 149, 64],
  [240, 249, 33],
];

function interp(stops: [number, number, number][], t: number): string {
  t = Math.max(0, Math.min(1, t));
  const segs = stops.length - 1;
  const idx = Math.min(segs - 1, Math.floor(t * segs));
  const localT = t * segs - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgb(${r},${g},${bl})`;
}

export function viridis(t: number): string {
  return interp(VIRIDIS, t);
}
export function plasma(t: number): string {
  return interp(PLASMA, t);
}

export function rampForVariable(key: string): (t: number) => string {
  if (key === 'air_temperature' || key === 'dry_bulb' || key === 'wet_bulb') return plasma;
  return viridis;
}

export function normalise(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}
