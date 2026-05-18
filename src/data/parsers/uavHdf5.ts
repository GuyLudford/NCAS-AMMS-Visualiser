import { v4 } from '../../lib/uuid';
import type { ParseResult, SampleRecord } from '../types';
import { GROUP_INFO } from '../types';
import { groupCodeFromFilename } from './common';
import { parseTime } from '../normalise/time';

// HDF5 in browser via h5wasm. Loaded lazily so the main bundle stays small.
export async function parseUavHdf5(file: File): Promise<ParseResult> {
  const h5 = await import('h5wasm');
  await h5.ready;
  const buf = new Uint8Array(await file.arrayBuffer());
  const tmpname = `/tmp/${file.name.replace(/[^a-z0-9._-]/gi, '_')}`;
  const fs = h5.FS as any;
  fs.writeFile(tmpname, buf);
  try {
    const hf = new h5.File(tmpname, 'r');
    const topNames = hf.keys();
    if (!topNames.length) throw new Error('empty HDF5');
    const topName = topNames[0];
    const top = hf.get(topName) as InstanceType<typeof h5.Group>;
    const cols = top.get('columns') as InstanceType<typeof h5.Group>;
    const df = cols.get('dataframe') as InstanceType<typeof h5.Dataset>;
    // For a compound dataset, value/to_array returns an array of rows where
    // each row is itself an array of member values in declaration order.
    // The dtype carries the member names.
    const rawRows = df.value as unknown as number[][] | null;
    const dtype = df.dtype as { compound_type?: { members?: { name: string }[] } } | string;
    if (!Array.isArray(rawRows) || typeof dtype !== 'object' || !dtype.compound_type?.members) {
      throw new Error('dataframe could not be decoded (expected compound type)');
    }
    const names = dtype.compound_type.members.map((m) => m.name);
    const idx = (n: string) => names.indexOf(n);
    const iLat = idx('Lat');
    const iLng = idx('Lng');
    const iAlt = idx('Alt');
    const iTime = idx('Time');
    const iTemp = idx('Temp');
    const iRH = idx('RH');
    const iPress = idx('Press');
    const iSpd = idx('Spd');
    const iRoll = idx('Roll');
    const iPitch = idx('Pitch');
    const iYaw = idx('Yaw');

    const records: SampleRecord[] = rawRows.map((row) => {
      const tEpoch = iTime >= 0 ? row[iTime] : undefined;
      const time = tEpoch ? parseTime(tEpoch) : undefined;
      return {
        time,
        lat: row[iLat],
        lon: row[iLng],
        alt: row[iAlt],
        values: {
          air_temperature: row[iTemp],
          relative_humidity: row[iRH],
          pressure: row[iPress],
          speed: row[iSpd],
          roll: row[iRoll],
          pitch: row[iPitch],
          yaw: row[iYaw],
        },
      };
    });
    hf.close();

    const group = groupCodeFromFilename(file.name) ?? undefined;
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
          meta: { instrument: 'UAV (HDF5)', group, sourceTz: 'utc' },
        },
      ],
      warnings: [],
    };
  } finally {
    try {
      fs.unlink(tmpname);
    } catch {
      // ignore
    }
  }
}
