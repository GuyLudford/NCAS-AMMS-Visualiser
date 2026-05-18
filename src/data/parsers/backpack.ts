import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { FSC_BLENCATHRA } from '../normalise/coords';

// Custom NCAS backpack logger — one line per sample at 5s cadence.
// Format: "$GPGGA,<...nmea...>,$GPRMC,<...nmea...>,KEY,VAL,KEY,VAL,..."
// Position is often blank (no GPS fix). PP_Z is barometric altitude
// derived by the logger so we can fall back to that for the Z axis.

const NMEA_TIME_DATE = /^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)/;

const FILENAME_DATE = /(\d{4}-\d{2}-\d{2})/;
const FILENAME_COLOR = /log_data_([a-z]+)_/i;

const COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  brown: '#a16207',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
};

export async function parseBackpack(file: File): Promise<ParseResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const dateMatch = file.name.match(FILENAME_DATE);
  const defaultDate = dateMatch?.[1] ?? '2026-05-15';
  const colorMatch = file.name.match(FILENAME_COLOR);
  const colorKey = colorMatch?.[1].toLowerCase() ?? 'orange';
  const color = COLORS[colorKey] ?? '#fb923c';

  let validFixes = 0;
  const records = lines
    .map((line) => parseLine(line, defaultDate))
    .filter((r): r is NonNullable<ReturnType<typeof parseLine>> => r !== null)
    .map((r) => {
      if (r.gpsFix) validFixes++;
      return r;
    });
  if (!records.length) return { datasets: [], warnings: [`${file.name}: no parseable rows`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `Backpack ${colorKey} ${file.name.replace(/\.txt$/i, '')}`,
        source: { filename: file.name },
        kind: validFixes > 1 ? 'track' : 'stations',
        variables: [
          { key: 'air_temperature', label: 'Air temperature (SHT)', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'barometric_altitude', label: 'Barometric altitude', unit: 'm' },
          { key: 'pp_temperature', label: 'Pressure-probe temperature', unit: '°C' },
          { key: 'battery', label: 'Battery', unit: 'V' },
        ],
        records: records.map((r) => ({
          time: r.time,
          lat: r.lat ?? FSC_BLENCATHRA.lat,
          lon: r.lon ?? FSC_BLENCATHRA.lon,
          alt: r.baroAlt ?? undefined,
          values: {
            air_temperature: r.sht_t,
            relative_humidity: r.sht_rh,
            pressure: r.pressureHpa,
            barometric_altitude: r.baroAlt,
            pp_temperature: r.pp_t,
            battery: r.bat,
          },
        })),
        style: { color, visible: true, opacity: 0.9, colorBy: 'barometric_altitude' },
        meta: {
          instrument: 'NCAS backpack',
          sourceTz: 'utc',
          warnings: validFixes < records.length / 2 ? [`${records.length - validFixes} samples without GPS fix`] : undefined,
        },
      },
    ],
    warnings: [],
  };
}

function parseLine(line: string, defaultDate: string) {
  const fields = line.split(',');
  // GPGGA at index 0, GPRMC at index ~14, key-value pairs after
  const gpggaTime = fields[1];
  let lat: number | null = null;
  let lon: number | null = null;
  let gpsFix = false;
  // GPGGA: time, lat, NS, lon, EW, quality, sats, hdop, alt, M, geoid, M, dgps_age, dgps_id*checksum
  const gpggaLat = fields[2];
  const gpggaLatNS = fields[3];
  const gpggaLon = fields[4];
  const gpggaLonEW = fields[5];
  const quality = parseInt(fields[6] ?? '0', 10);
  if (quality > 0 && gpggaLat && gpggaLon) {
    lat = nmeaLatLon(gpggaLat, gpggaLatNS);
    lon = nmeaLatLon(gpggaLon, gpggaLonEW);
    if (Number.isFinite(lat as number) && Number.isFinite(lon as number)) gpsFix = true;
  }

  const time = parseGpggaTime(gpggaTime, defaultDate);

  // Walk the key-value tail (BAT, PP, PP_T, PP_Z, SHT_RH, SHT_T)
  let bat: number | null = null;
  let pressureHpa: number | null = null;
  let baroAlt: number | null = null;
  let pp_t: number | null = null;
  let sht_rh: number | null = null;
  let sht_t: number | null = null;
  for (let i = 0; i < fields.length - 1; i++) {
    const k = fields[i];
    const vRaw = fields[i + 1];
    if (!vRaw) continue;
    switch (k) {
      case 'BAT': {
        const m = vRaw.match(/([\d.]+)/);
        if (m) bat = parseFloat(m[1]);
        break;
      }
      case 'PP': {
        const m = vRaw.match(/([\d.]+)/);
        if (m) pressureHpa = parseFloat(m[1]) / 100;
        break;
      }
      case 'PP_T':
      case 'SHT_T': {
        const m = vRaw.match(/(-?[\d.]+)/);
        if (m) {
          if (k === 'PP_T') pp_t = parseFloat(m[1]);
          else sht_t = parseFloat(m[1]);
        }
        break;
      }
      case 'PP_Z': {
        const m = vRaw.match(/([\d.]+)/);
        if (m) baroAlt = parseFloat(m[1]);
        break;
      }
      case 'SHT_RH': {
        const m = vRaw.match(/([\d.]+)/);
        if (m) sht_rh = parseFloat(m[1]);
        break;
      }
    }
  }

  if (time == null && !gpsFix && pressureHpa == null) return null;
  return { time, lat, lon, gpsFix, bat, pressureHpa, baroAlt, pp_t, sht_rh, sht_t };
}

function parseGpggaTime(raw: string | undefined, defaultDate: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(NMEA_TIME_DATE);
  if (!m) return undefined;
  return parseTime(`${m[1]}:${m[2]}:${m[3]}`, { sourceTz: 'utc', defaultDate });
}

// "ddmm.mmm" / "dddmm.mmm" + hemisphere → decimal degrees
function nmeaLatLon(raw: string, hemi: string): number | null {
  if (!raw) return null;
  const dotIdx = raw.indexOf('.');
  if (dotIdx < 3) return null;
  const degStr = raw.slice(0, dotIdx - 2);
  const minStr = raw.slice(dotIdx - 2);
  const deg = parseInt(degStr, 10);
  const min = parseFloat(minStr);
  if (!Number.isFinite(deg) || !Number.isFinite(min)) return null;
  let dd = deg + min / 60;
  const h = hemi?.toUpperCase();
  if (h === 'S' || h === 'W') dd = -dd;
  return dd;
}
