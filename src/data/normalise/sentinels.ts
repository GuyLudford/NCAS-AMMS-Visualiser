// Replace common sentinel values with null.

const SENTINELS = new Set(['-', '***', '', 'NA', 'N/A', 'NaN', 'nan']);

export function denull(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (SENTINELS.has(t)) return null;
    return t;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (v <= -9999) return null;
    return v;
  }
  return v;
}

export function denullNumber(v: unknown): number | null {
  const d = denull(v);
  if (d == null) return null;
  const n = typeof d === 'number' ? d : parseFloat(String(d));
  if (!Number.isFinite(n)) return null;
  if (n <= -9999) return null;
  return n;
}
