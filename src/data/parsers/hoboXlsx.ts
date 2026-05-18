import * as XLSX from 'xlsx';
import { v4 } from '../../lib/uuid';
import type { ParseResult, SampleRecord } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { FSC_BLENCATHRA } from '../normalise/coords';

// HOBO MX2301/MX2302 XLSX export. Sheets have the same columns as the CSV
// (Date-Time (BST), Temperature, RH, Dew Point) but in spreadsheet form.
export async function parseHoboXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const datasets: ParseResult['datasets'] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    const dateKey = keys.find((k) => /Date.?Time/i.test(k));
    const tempKey = keys.find((k) => /^Temperature\b/i.test(k));
    const rhKey = keys.find((k) => /^RH\b/i.test(k));
    const dpKey = keys.find((k) => /Dew\s*Point/i.test(k));
    if (!dateKey || !tempKey) {
      warnings.push(`${file.name}#${sheetName}: not a HOBO sheet (missing Date-Time/Temperature)`);
      continue;
    }
    const records: SampleRecord[] = rows
      .map((r): SampleRecord | null => {
        const time = parseTime(r[dateKey], { sourceTz: 'Europe/London' });
        if (!time) return null;
        return {
          time,
          lat: FSC_BLENCATHRA.lat,
          lon: FSC_BLENCATHRA.lon,
          values: {
            air_temperature: denullNumber(r[tempKey]),
            relative_humidity: rhKey ? denullNumber(r[rhKey]) : null,
            dew_point: dpKey ? denullNumber(r[dpKey]) : null,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (!records.length) continue;
    datasets.push({
      id: v4(),
      name: `HOBO ${file.name.replace(/\.xlsx$/i, '')}${sheetName === wb.SheetNames[0] ? '' : ` / ${sheetName}`}`,
      source: { filename: file.name, sheet: sheetName },
      kind: 'stations',
      variables: [
        { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
        { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
        { key: 'dew_point', label: 'Dew point', unit: '°C' },
      ],
      records,
      style: { color: '#16a34a', visible: true, opacity: 0.9, colorBy: 'air_temperature' },
      meta: { instrument: 'HOBO reference', sourceTz: 'Europe/London' },
    });
  }
  return { datasets, warnings };
}
