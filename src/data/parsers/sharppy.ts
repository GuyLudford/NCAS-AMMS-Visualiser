import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { FSC_BLENCATHRA } from '../normalise/coords';

// SHARPpy/SPC format used by Windsond exports.
// Sections:
//   %TITLE%
//   STN YYMMDD/HHMM
//   header line
//   --- separator ---
//   %RAW%
//   PRES, HGHT, TEMP, DWPT, WDIR, WSPD       (mb, m MSL, C, C, deg, knots)
//   ...
//   %END%
//
// Sentinel: -9999.00.
const KNOTS_TO_MS = 0.514444;

export async function parseSharppy(file: File): Promise<ParseResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  // Find launch time from line beginning with a station code, e.g. " XXX   260517/1342"
  let launchTime: string | undefined;
  for (const line of lines) {
    const m = line.trim().match(/^\S+\s+(\d{6})\/(\d{4})$/);
    if (m) {
      const yy = m[1].slice(0, 2);
      const mo = m[1].slice(2, 4);
      const dd = m[1].slice(4, 6);
      const hh = m[2].slice(0, 2);
      const mi = m[2].slice(2, 4);
      const year = parseInt(yy, 10) + 2000;
      launchTime = parseTime(`${year}-${mo}-${dd} ${hh}:${mi}`, { sourceTz: 'utc' });
      break;
    }
  }
  const rawIdx = lines.findIndex((l) => l.trim() === '%RAW%');
  const endIdx = lines.findIndex((l, i) => i > rawIdx && l.trim() === '%END%');
  if (rawIdx === -1) return { datasets: [], warnings: [`${file.name}: no %RAW% block`] };
  const stop = endIdx === -1 ? lines.length : endIdx;
  const rawLines = lines.slice(rawIdx + 1, stop);

  const records = rawLines
    .map((line) => {
      const parts = line.trim().split(/\s*,\s*/);
      if (parts.length < 6) return null;
      const nums = parts.map((p) => parseFloat(p));
      const [pres, hgt, temp, dwpt, wdir, wspdKnots] = nums.map((n) => (n <= -9999 ? null : n));
      if (hgt == null) return null;
      return {
        time: launchTime,
        lat: FSC_BLENCATHRA.lat,
        lon: FSC_BLENCATHRA.lon,
        alt: hgt,
        values: {
          pressure: pres,
          air_temperature: temp,
          dew_point: dwpt,
          wind_direction: wdir,
          wind_speed: wspdKnots != null ? wspdKnots * KNOTS_TO_MS : null,
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no usable rows in %RAW%`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `SharpPy ${file.name.replace(/\.sharppy\.txt$/i, '')}`,
        source: { filename: file.name },
        kind: 'profile',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'dew_point', label: 'Dew point', unit: '°C' },
          { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
          { key: 'wind_direction', label: 'Wind direction', unit: '°' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
        ],
        records,
        style: { color: '#d946ef', visible: true, opacity: 0.9, colorBy: 'air_temperature' },
        meta: { instrument: 'Windsond (SharpPy)', sourceTz: 'utc', altitudeRef: 'MSL' },
      },
    ],
    warnings: [],
  };
}
