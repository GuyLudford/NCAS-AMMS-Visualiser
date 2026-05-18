// Unit conversion helpers. Everything in the dataset store is normalised to
// SI / common atmospheric science conventions: degC, hPa, m, m/s, %, m AGL.

export function kToC(k: number): number {
  return k - 273.15;
}
export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}
export function mphToMs(v: number): number {
  return v * 0.44704;
}
export function paToHpa(p: number): number {
  return p / 100;
}

export function inferTemperatureUnit(values: number[]): 'C' | 'K' | 'F' | 'unknown' {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return 'unknown';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min > 200 && max < 350) return 'K';
  if (min > -60 && max < 70) return 'C';
  if (min > -50 && max < 150 && min < -10) return 'F'; // unlikely on this course but kept
  return 'C';
}
