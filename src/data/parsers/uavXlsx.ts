import * as XLSX from 'xlsx';
import { v4 } from '../../lib/uuid';
import type { ParseResult, SampleRecord } from '../types';
import { GROUP_INFO } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { groupCodeFromFilename } from './common';

// Parses an XLSX/CSV with the standard UAV telemetry schema:
//   Roll, Pitch, Yaw, Lat, Lng, Alt, Spd, Press, Temp, RH, Time
// (Time may be "Time" as ISO, "Time (UNIX)" as epoch seconds, or both.)
// Used for the "Replacement Drone Flight Data.xlsx" the students sometimes
// export from the HDF5 file.
export async function parseUavXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const datasets: ParseResult['datasets'] = [];
  const warnings: string[] = [];
  const group = groupCodeFromFilename(file.name) ?? undefined;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    if (!rows.length) continue;
    const sample = rows[0];
    const keys = Object.keys(sample);
    const needsAll = ['Lat', 'Lng', 'Alt'];
    if (!needsAll.every((k) => keys.includes(k))) {
      warnings.push(`${file.name}#${sheetName}: not a UAV telemetry sheet (missing Lat/Lng/Alt)`);
      continue;
    }
    const records: SampleRecord[] = rows
      .map((r): SampleRecord | null => {
        const lat = denullNumber(r.Lat);
        const lon = denullNumber(r.Lng ?? r.Lon ?? r.Longitude);
        if (lat == null || lon == null) return null;
        let time = parseTime(r.Time, { sourceTz: 'utc' });
        if (!time && r['Time (UNIX)']) {
          time = parseTime(denullNumber(r['Time (UNIX)']) ?? undefined);
        }
        return {
          time,
          lat,
          lon,
          alt: denullNumber(r.Alt) ?? undefined,
          values: {
            air_temperature: denullNumber(r.Temp),
            relative_humidity: denullNumber(r.RH),
            pressure: denullNumber(r.Press),
            speed: denullNumber(r.Spd),
            roll: denullNumber(r.Roll),
            pitch: denullNumber(r.Pitch),
            yaw: denullNumber(r.Yaw),
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (!records.length) {
      warnings.push(`${file.name}#${sheetName}: no rows with usable coordinates`);
      continue;
    }
    datasets.push({
      id: v4(),
      name: `UAV ${group ?? ''} ${file.name}${sheetName === wb.SheetNames[0] ? '' : ` / ${sheetName}`}`.trim(),
      source: { filename: file.name, sheet: sheetName },
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
      meta: { instrument: 'UAV (XLSX)', group, sourceTz: 'utc' },
    });
  }
  return { datasets, warnings };
}
