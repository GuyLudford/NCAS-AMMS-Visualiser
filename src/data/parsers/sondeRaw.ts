import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { paToHpa } from '../normalise/units';
import { FSC_BLENCATHRA } from '../normalise/coords';

const FILENAME_TIME = /(\d{4}-\d{2}-\d{2})[_-](\d{2})(\d{2})/;

// Windsond *.raw.csv — sensor stream with altitude but NO GPS.
// Header: "Altitude (m MSL), Pressure (Pascal), Speed (m/s), Heading (degrees), Temperature (C), Relative humidity (%)"
export async function parseSondeRaw(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty CSV`] };

  // Use the filename to anchor a synthetic time for ordering.
  const fnMatch = file.name.match(FILENAME_TIME);
  const launchTime = fnMatch
    ? parseTime(`${fnMatch[1]} ${fnMatch[2]}:${fnMatch[3]}`, { sourceTz: 'utc' })
    : undefined;

  const records = rows
    .map((r) => {
      const alt = denullNumber(r['Altitude (m MSL)']);
      if (alt == null) return null;
      const presRaw = denullNumber(r['Pressure (Pascal)']);
      return {
        time: launchTime,
        lat: FSC_BLENCATHRA.lat,
        lon: FSC_BLENCATHRA.lon,
        alt,
        values: {
          pressure: presRaw != null ? paToHpa(presRaw) : null,
          air_temperature: denullNumber(r['Temperature (C)']),
          relative_humidity: denullNumber(r['Relative humidity (%)']),
          speed: denullNumber(r['Speed (m/s)']),
          heading: denullNumber(r['Heading (degrees)']),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no rows with altitude`] };
  return {
    datasets: [
      {
        id: v4(),
        name: `Sonde raw ${file.name.replace(/\.raw\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'profile',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'speed', label: 'Speed', unit: 'm/s' },
          { key: 'heading', label: 'Heading', unit: '°' },
        ],
        records,
        style: { color: '#c084fc', visible: true, opacity: 0.9, colorBy: 'air_temperature' },
        meta: { instrument: 'Windsond (raw)', sourceTz: 'utc', altitudeRef: 'MSL' },
      },
    ],
    warnings: [],
  };
}
