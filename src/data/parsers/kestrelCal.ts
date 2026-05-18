import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';
import { denullNumber } from '../normalise/sentinels';
import { FSC_BLENCATHRA } from '../normalise/coords';

// Kestrel inter-instrument calibration table (cal.csv / cal.xlsx).
// Reference row + per-serial offsets across T, Td, RH. Not placed on the
// map — registered as a metadata dataset that shows up in the sidebar as
// a single "calibration" pin at the FSC, with the offsets in the detail
// panel.
export async function parseKestrelCal(file: File): Promise<ParseResult> {
  let rows: Record<string, unknown>[];
  if (/\.xlsx$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]!, { defval: null, header: 'A' });
  } else {
    const text = await file.text();
    rows = Papa.parse<Record<string, unknown>>(text, { skipEmptyLines: true, header: false }).data as any;
  }
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty`] };

  // Skip header + unit rows; rows look like [serial, T, Td, RH].
  const entries: { name: string; T: number | null; Td: number | null; RH: number | null }[] = [];
  for (const r of rows) {
    const cells = Object.values(r) as unknown[];
    const name = cells[0] != null ? String(cells[0]) : '';
    if (!name || /^(serial|reference|T|Td|RH|degC|%|,)/i.test(name) && /^(T|Td|RH|degC|%)/i.test(name)) {
      // header / unit row
    }
    if (!name || name === 'null') continue;
    const t = denullNumber(cells[1]);
    const td = denullNumber(cells[2]);
    const rh = denullNumber(cells[3]);
    if (t == null && td == null && rh == null) continue;
    entries.push({ name, T: t, Td: td, RH: rh });
  }
  if (!entries.length) return { datasets: [], warnings: [`${file.name}: no readable rows`] };

  // Use the first row as the reference if it's labelled so.
  const refIdx = entries.findIndex((e) => /reference/i.test(e.name));
  const reference = refIdx >= 0 ? entries[refIdx] : entries[0];

  return {
    datasets: [
      {
        id: v4(),
        name: `Kestrel calibration ${file.name}`,
        source: { filename: file.name },
        kind: 'stations',
        variables: [
          { key: 'air_temperature_offset', label: 'T offset', unit: '°C' },
          { key: 'dew_point_offset', label: 'Td offset', unit: '°C' },
          { key: 'relative_humidity_offset', label: 'RH offset', unit: '%' },
        ],
        records: entries
          .filter((e) => e !== reference)
          .map((e) => ({
            lat: FSC_BLENCATHRA.lat,
            lon: FSC_BLENCATHRA.lon,
            values: {
              air_temperature_offset: e.T != null && reference.T != null ? e.T - reference.T : null,
              dew_point_offset: e.Td != null && reference.Td != null ? e.Td - reference.Td : null,
              relative_humidity_offset: e.RH != null && reference.RH != null ? e.RH - reference.RH : null,
              serial: e.name,
            },
          })),
        style: { color: '#fb923c', visible: true, opacity: 0.8 },
        meta: {
          instrument: 'Kestrel calibration',
          reference: reference.name,
        },
      },
    ],
    warnings: [],
  };
}
