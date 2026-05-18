import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { GROUP_INFO } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { groupCodeFromFilename } from './common';

export async function parseUavCsv(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const rows = parsed.data;
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty CSV`] };

  const group = groupCodeFromFilename(file.name) ?? undefined;
  const records = rows
    .map((r) => {
      const lat = denullNumber(r.Lat ?? r.Latitude);
      const lon = denullNumber(r.Lng ?? r.Lon ?? r.Longitude);
      if (lat == null || lon == null) return null;
      return {
        time: parseTime(r.Time ?? r.time, { sourceTz: 'utc' }),
        lat,
        lon,
        alt: denullNumber(r.Alt ?? r.Altitude) ?? undefined,
        values: {
          air_temperature: denullNumber(r.Temp ?? r.Temperature),
          relative_humidity: denullNumber(r.RH),
          pressure: denullNumber(r.Press ?? r.Pressure),
          speed: denullNumber(r.Spd ?? r.Speed),
          roll: denullNumber(r.Roll),
          pitch: denullNumber(r.Pitch),
          yaw: denullNumber(r.Yaw),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no rows with usable coordinates`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `UAV ${group ?? ''} ${file.name}`.trim(),
        source: { filename: file.name },
        kind: 'track',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'pressure', label: 'Pressure', unit: 'hPa' },
          { key: 'speed', label: 'Speed', unit: 'm/s' },
          { key: 'roll', label: 'Roll', unit: '°' },
          { key: 'pitch', label: 'Pitch', unit: '°' },
          { key: 'yaw', label: 'Yaw', unit: '°' },
        ],
        records,
        style: {
          color: group ? GROUP_INFO[group].color : '#ef4444',
          visible: true,
          opacity: 1,
          colorBy: 'alt',
        },
        meta: { instrument: 'UAV', group, sourceTz: 'utc' },
      },
    ],
    warnings: [],
  };
}
