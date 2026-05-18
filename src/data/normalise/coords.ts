// Convert any latitude or longitude representation we have observed in the
// AMMS data into signed decimal degrees. Returns NaN if it can't parse.

const DMS_TYPO = /^(-?)(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NSEW])?$/i;
const DMS_COMMA = /^(-?)(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*$/;
const NMEA_PACKED = /^([NSEW])(\d{2,3})(\d{2})(\d{2,4})$/i;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseCoord(raw: unknown, kind: 'lat' | 'lon'): number {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s === '' || s === '-' || s === '***') return NaN;

  let m = s.match(DECIMAL);
  if (m) return parseFloat(s);

  m = s.match(DMS_TYPO);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const d = parseFloat(m[2]);
    const min = parseFloat(m[3]);
    const sec = parseFloat(m[4]);
    let dd = d + min / 60 + sec / 3600;
    if (m[5]) {
      const hemi = m[5].toUpperCase();
      if (hemi === 'S' || hemi === 'W') dd = -dd;
    } else {
      dd *= sign;
    }
    return dd;
  }

  m = s.match(DMS_COMMA);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const d = parseFloat(m[2]);
    const min = parseFloat(m[3]);
    let secRaw = parseFloat(m[4]);
    // Heuristic: some sheets store the third triplet as milli-arc-min
    // (e.g. "37,257" really means 37.257 minutes). If >= 60 it can only be
    // milli-arc-min so divide accordingly.
    let sec: number;
    let useMin: number;
    if (secRaw >= 60) {
      useMin = min + secRaw / 1000;
      sec = 0;
    } else {
      useMin = min;
      sec = secRaw;
    }
    return sign * (d + useMin / 60 + sec / 3600);
  }

  m = s.match(NMEA_PACKED);
  if (m) {
    const hemi = m[1].toUpperCase();
    const deg = parseInt(m[2], 10);
    const mins = parseInt(m[3], 10);
    const fracStr = m[4];
    // Treat fracStr as milli-arc-min (e.g. "5437258" → 54° 37.258') if >2 digits
    const fracMin = fracStr.length >= 2 ? parseInt(fracStr, 10) / Math.pow(10, fracStr.length) : 0;
    let dd = deg + (mins + fracMin) / 60;
    if (hemi === 'S' || hemi === 'W') dd = -dd;
    return dd;
  }

  return NaN;
}

// Blencathra FSC is in Cumbria (West of Greenwich). If a sheet has positive
// longitudes that should be negative, flip them. Returns the (possibly
// flipped) value and a flag.
export function fixWestLon(lon: number): { lon: number; flipped: boolean } {
  if (Number.isFinite(lon) && lon > 1 && lon < 10) {
    return { lon: -lon, flipped: true };
  }
  return { lon, flipped: false };
}

export const BLENCATHRA_CENTRE = { lat: 54.6446, lon: -3.0509 };
export const FSC_BLENCATHRA = { lat: 54.6394, lon: -3.0876 };
