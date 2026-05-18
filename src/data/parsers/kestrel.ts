import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { FSC_BLENCATHRA } from '../normalise/coords';

// Kestrel 5500L LiNK CSV export. Preamble lines, then header row beginning
// with "Time,". Wind direction comes in as "***" when speed is 0.
export async function parseKestrel(file: File): Promise<ParseResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  // Find the "Time," header line
  const headerIdx = lines.findIndex((l) => /^Time(,|\t)/i.test(l));
  if (headerIdx === -1) return { datasets: [], warnings: [`${file.name}: header row not found`] };

  // Extract serial number from preamble if present
  let serial = '';
  for (let i = 0; i < headerIdx; i++) {
    const m = lines[i].match(/^Serial[:,]\s*(\S+)/i);
    if (m) serial = m[1].replace(/,/g, '');
  }

  const csv = lines.slice(headerIdx).join('\n');
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;

  const records = rows
    .map((r) => {
      // Gail's file has TWO "Time" columns — the second becomes "Time_1"
      const tStr = r.Time || r.Time_1;
      const time = parseTime(tStr, { sourceTz: 'utc' });
      if (!time) return null;
      return {
        time,
        lat: FSC_BLENCATHRA.lat,
        lon: FSC_BLENCATHRA.lon,
        values: {
          air_temperature: denullNumber(r.Temp),
          wet_bulb: denullNumber(r['Wet Bulb Temp.']),
          relative_humidity: denullNumber(r['Rel. Hum.']),
          pressure: denullNumber(r['Baro.']),
          station_pressure: denullNumber(r['Station P.']),
          altitude: denullNumber(r['Altitude']),
          wind_speed: denullNumber(r['Wind Speed']),
          heat_index: denullNumber(r['Heat Index']),
          dew_point: denullNumber(r['Dew Point']),
          density_alt: denullNumber(r['Dens. Alt.']),
          true_dir: denullNumber(r['True Dir.']),
          wind_chill: denullNumber(r['Wind Chill']),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no data rows`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `Kestrel ${serial || file.name}`,
        source: { filename: file.name },
        kind: 'stations',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'wet_bulb', label: 'Wet bulb', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
          { key: 'dew_point', label: 'Dew point', unit: '°C' },
        ],
        records,
        style: { color: '#f97316', visible: true, opacity: 1, colorBy: 'air_temperature' },
        meta: { instrument: 'Kestrel 5500L', serial, sourceTz: 'utc' },
      },
    ],
    warnings: [],
  };
}
