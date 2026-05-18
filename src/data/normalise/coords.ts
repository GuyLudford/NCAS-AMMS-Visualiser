// Convert any latitude or longitude representation we have observed in the
// AMMS data into signed decimal degrees. Returns NaN if it can't parse.

const DMS_TYPO = /^(-?)(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NSEW])?$/i;
const DMS_COMMA = /^(-?)(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*$/;
// Hemisphere-specific NMEA packed format. Lat degrees are 2 digits, lon 3.
const NMEA_LAT = /^([NS])(\d{2})(\d{2})\.?(\d{0,5})$/i;
const NMEA_LON = /^([EW])(\d{3})(\d{2})\.?(\d{0,5})$/i;
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
    const secRaw = parseFloat(m[4]);
    // Heuristic: some sheets encode the third triplet as milli-arc-min
    // (e.g. "37,257" means 37.257 minutes). If >= 60 it can't be seconds.
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

  const pattern = kind === 'lat' ? NMEA_LAT : NMEA_LON;
  m = s.match(pattern);
  if (m) {
    const hemi = m[1].toUpperCase();
    const deg = parseInt(m[2], 10);
    const mins = parseInt(m[3], 10);
    const fracStr = m[4] ?? '';
    const fracMin = fracStr ? parseInt(fracStr, 10) / Math.pow(10, fracStr.length) : 0;
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

// "DMS-as-decimal": user typed 54.37 thinking it meant 54° 37'. Detected when
// the integer part is a plausible degree and the fractional part scaled by
// 100 looks like a minute value (i.e. 0-60). Used as a per-sheet retry in
// the walk-workbook parser when raw DD interpretation falls outside the
// expected Blencathra envelope.
export function dmsAsDecimalToDD(raw: number): number {
  const sign = raw < 0 ? -1 : 1;
  const abs = Math.abs(raw);
  const deg = Math.floor(abs);
  const frac = abs - deg;
  const minutes = frac * 100;
  if (minutes >= 60) return raw; // not DMS-as-decimal-shaped
  return sign * (deg + minutes / 60);
}

export const BLENCATHRA_CENTRE = { lat: 54.6446, lon: -3.0509 };
export const FSC_BLENCATHRA = { lat: 54.6394, lon: -3.0876 };

// Plausible bounding box around the AMMSS field area (covers FSC, the walk
// route, summits, the Threlkeld–Keswick corridor with comfortable padding).
export const AMMSS_LAT_RANGE: [number, number] = [54.45, 54.85];
export const AMMSS_LON_RANGE: [number, number] = [-3.25, -2.85];

export function isInAmmssBox(lat: number, lon: number): boolean {
  return (
    lat >= AMMSS_LAT_RANGE[0] && lat <= AMMSS_LAT_RANGE[1] && lon >= AMMSS_LON_RANGE[0] && lon <= AMMSS_LON_RANGE[1]
  );
}
