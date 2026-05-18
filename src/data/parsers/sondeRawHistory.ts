import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { paToHpa } from '../normalise/units';
import { FSC_BLENCATHRA } from '../normalise/coords';

const FILENAME_DATE = /(\d{4}-\d{2}-\d{2})/;

// Windsond *.raw_history.csv — full timeseries including some GPS-tagged rows.
// Header: "UTC time, Altitude (m MSL), Altitude (m AGL), Pressure (Pascal), Speed, Heading,
//          Temperature, RH, Internal T, Latitude, Longitude, Rise speed"
export async function parseSondeRawHistory(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty CSV`] };

  const dateMatch = file.name.match(FILENAME_DATE);
  const defaultDate = dateMatch?.[1];

  let lastLat: number | null = null;
  let lastLon: number | null = null;
  const records = rows
    .map((r) => {
      const altMSL = denullNumber(r['Altitude (m MSL)']);
      if (altMSL == null) return null;
      const lat = denullNumber(r['Latitude']);
      const lon = denullNumber(r['Longitude']);
      if (lat != null) lastLat = lat;
      if (lon != null) lastLon = lon;
      const useLat = lastLat ?? FSC_BLENCATHRA.lat;
      const useLon = lastLon ?? FSC_BLENCATHRA.lon;
      const presRaw = denullNumber(r['Pressure (Pascal)']);
      const utc = r['UTC time'];
      const time = parseTime(utc, { sourceTz: 'utc', defaultDate });
      return {
        time,
        lat: useLat,
        lon: useLon,
        alt: altMSL,
        values: {
          alt_agl: denullNumber(r['Altitude (m AGL)']),
          pressure: presRaw != null ? paToHpa(presRaw) : null,
          air_temperature: denullNumber(r['Temperature (C)']),
          relative_humidity: denullNumber(r['Relative humidity (%)']),
          rise_speed: denullNumber(r['Rise speed (m/s)']),
          speed: denullNumber(r['Speed (m/s)']),
          heading: denullNumber(r['Heading (degrees)']),
          internal_temperature: denullNumber(r['Internal temperature (C)']),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no rows`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `Sonde history ${file.name.replace(/\.raw_history\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'track',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'rise_speed', label: 'Rise speed', unit: 'm/s' },
          { key: 'alt_agl', label: 'Altitude AGL', unit: 'm' },
        ],
        records,
        style: { color: '#a78bfa', visible: true, opacity: 0.85, colorBy: 'alt' },
        meta: { instrument: 'Windsond (history)', sourceTz: 'utc', altitudeRef: 'MSL' },
      },
    ],
    warnings: [],
  };
}
