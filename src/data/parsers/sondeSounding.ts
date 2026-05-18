import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';

const HEADER_LAT = /lat=(-?[\d.]+)/;
const HEADER_LON = /lon=(-?[\d.]+)/;
const HEADER_TIME = /utc_time=([\d-]+\s+[\d:]+)/;
const FILENAME_TIME = /(\d{4}-\d{2}-\d{2})[_-](\d{2})(\d{2})/;

export async function parseSondeSounding(file: File): Promise<ParseResult> {
  const text = await file.text();
  const firstBlock = text.split('\n').slice(0, 3).join('\n');
  let launchLat = 54.6394;
  let launchLon = -3.0876;
  let launchTime: string | undefined;
  const mLat = firstBlock.match(HEADER_LAT);
  const mLon = firstBlock.match(HEADER_LON);
  const mTime = firstBlock.match(HEADER_TIME);
  if (mLat) launchLat = parseFloat(mLat[1]);
  if (mLon) launchLon = parseFloat(mLon[1]);
  if (mTime) launchTime = parseTime(mTime[1], { sourceTz: 'utc' });
  if (!launchTime) {
    const fnMatch = file.name.match(FILENAME_TIME);
    if (fnMatch) launchTime = parseTime(`${fnMatch[1]} ${fnMatch[2]}:${fnMatch[3]}`, { sourceTz: 'utc' });
  }

  const lines = text.split('\n').filter((l) => !l.startsWith('#'));
  const csv = lines.join('\n');
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;

  const records = rows
    .map((r) => {
      const h = denullNumber(r['Height (m AGL)']);
      if (h == null) return null;
      return {
        time: launchTime,
        lat: launchLat,
        lon: launchLon,
        alt: h, // height AGL — used as Z for profile rendering
        values: {
          pressure: denullNumber(r['Pressure (mb)']),
          air_temperature: denullNumber(r['Temperature (C)']),
          relative_humidity: denullNumber(r['Relative humidity (%)']),
          wind_speed: denullNumber(r['Wind speed (m/s)']),
          wind_direction: denullNumber(r['Wind direction (true deg)']),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) {
    return { datasets: [], warnings: [`${file.name}: no usable rows`] };
  }

  return {
    datasets: [
      {
        id: v4(),
        name: `Sonde ${file.name.replace(/\.sounding\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'profile',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
          { key: 'wind_direction', label: 'Wind direction', unit: '°' },
        ],
        records,
        style: { color: '#a855f7', visible: true, opacity: 1, colorBy: 'relative_humidity' },
        meta: { instrument: 'Windsond', launchTime, launchLat, launchLon, sourceTz: 'utc' },
      },
    ],
    warnings: [],
  };
}
