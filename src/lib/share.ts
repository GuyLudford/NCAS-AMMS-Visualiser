// Encode/decode a tiny piece of view state into the URL hash so users can
// share the moment they're looking at. Datasets themselves are not part of
// the hash — they have to be re-dropped — but everything else is.
import type { Map as MapLibre } from 'maplibre-gl';

export interface ShareState {
  c?: [number, number]; // [lon, lat]
  z?: number; // zoom
  p?: number; // pitch
  b?: number; // bearing
  bm?: string; // basemap id
  ex?: number; // altitude exaggeration
  t3?: 0 | 1; // towers on/off
  tw?: [number, number]; // time window start/end (epoch s)
}

export function encodeShare(state: ShareState): string {
  const compact: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (v == null) continue;
    if (Array.isArray(v)) compact[k] = v.map((n) => Math.round(typeof n === 'number' ? n * 1e5 : n) / 1e5);
    else compact[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  }
  return encodeURIComponent(JSON.stringify(compact));
}

export function decodeShare(hash: string): ShareState | null {
  const trimmed = hash.replace(/^#/, '');
  if (!trimmed) return null;
  try {
    return JSON.parse(decodeURIComponent(trimmed));
  } catch {
    return null;
  }
}

export function snapshotMap(map: MapLibre): Pick<ShareState, 'c' | 'z' | 'p' | 'b'> {
  const c = map.getCenter();
  return {
    c: [c.lng, c.lat],
    z: map.getZoom(),
    p: map.getPitch(),
    b: map.getBearing(),
  };
}

export function applyToMap(map: MapLibre, s: ShareState) {
  if (s.c) map.jumpTo({ center: s.c });
  if (s.z != null) map.setZoom(s.z);
  if (s.p != null) map.setPitch(s.p);
  if (s.b != null) map.setBearing(s.b);
}
