import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { FSC_BLENCATHRA } from '../normalise/coords';

// HOBO MX2301 / MX2302 reference thermometer export.
// Header (with BOM): "#,Date-Time (BST),Temperature   (°C),RH   (%),Dew Point   (°C),Host Connected,End of File"
export async function parseHobo(file: File): Promise<ParseResult> {
  const text = (await file.text()).replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty CSV`] };

  // Column names contain double-spaces due to HOBO format
  const tempKey = parsed.meta.fields?.find((f) => /^Temperature\s/.test(f)) ?? 'Temperature';
  const rhKey = parsed.meta.fields?.find((f) => /^RH\s/.test(f)) ?? 'RH';
  const dpKey = parsed.meta.fields?.find((f) => /^Dew Point\s/.test(f)) ?? 'Dew Point';
  const dateKey = parsed.meta.fields?.find((f) => /Date-Time/.test(f)) ?? 'Date-Time (BST)';

  const records = rows
    .map((r) => {
      const time = parseTime(r[dateKey], { sourceTz: 'Europe/London' });
      if (!time) return null;
      return {
        time,
        lat: FSC_BLENCATHRA.lat,
        lon: FSC_BLENCATHRA.lon,
        values: {
          air_temperature: denullNumber(r[tempKey]),
          relative_humidity: denullNumber(r[rhKey]),
          dew_point: denullNumber(r[dpKey]),
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no parseable rows`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `HOBO ${file.name.replace(/\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'stations',
        variables: [
          { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
          { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
          { key: 'dew_point', label: 'Dew point', unit: '°C' },
        ],
        records,
        style: { color: '#16a34a', visible: true, opacity: 0.9, colorBy: 'air_temperature' },
        meta: { instrument: 'HOBO reference', sourceTz: 'Europe/London' },
      },
    ],
    warnings: [],
  };
}
