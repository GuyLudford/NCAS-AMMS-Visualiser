import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { paToHpa } from '../normalise/units';

// Parses *.raw_flight_history.csv from a Windsond. Sparse GPS — forward-fill
// last known position so every row has lat/lon for map rendering.
export async function parseSondeFlight(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;

  // Try to glean the launch date from the filename: 2026-05-17_1437.raw_*.csv
  const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
  const defaultDate = dateMatch?.[1];

  let lastLat: number | null = null;
  let lastLon: number | null = null;
  const records = rows
    .map((r) => {
      const utc = r['UTC time'];
      const altMSL = denullNumber(r['Altitude (m MSL)']);
      if (altMSL == null) return null;
      const lat = denullNumber(r['Latitude']);
      const lon = denullNumber(r['Longitude']);
      if (lat != null) lastLat = lat;
      if (lon != null) lastLon = lon;
      if (lastLat == null || lastLon == null) return null;
      const time = parseTime(utc, { sourceTz: 'utc', defaultDate });
      return {
        time,
        lat: lastLat,
        lon: lastLon,
        alt: altMSL,
        values: {
          alt_agl: denullNumber(r['Altitude (m AGL)']),
          pressure: r['Pressure (Pascal)'] != null ? paToHpa(parseFloat(r['Pressure (Pascal)'])) : null,
          air_temperature: denullNumber(r['Temperature (C)']),
          relative_humidity: denullNumber(r['Relative humidity (%)']),
          rise_speed: denullNumber(r['Rise speed (m/s)']),
          speed: denullNumber(r['Speed (m/s)']),
          heading: denullNumber(r['Heading (degrees)']),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no fixes`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `Sonde track ${file.name.replace(/\.raw_flight_history\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'track',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'rise_speed', label: 'Rise speed', unit: 'm/s' },
        ],
        records,
        style: { color: '#c084fc', visible: true, opacity: 0.7, colorBy: 'alt' },
        meta: { instrument: 'Windsond track', sourceTz: 'utc' },
      },
    ],
    warnings: [],
  };
}
