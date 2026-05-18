import Papa from 'papaparse';
import { v4 } from '../../lib/uuid';
import type { ParseResult, Variable } from '../types';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { FSC_BLENCATHRA } from '../normalise/coords';

const UNIT_MAP: Record<string, string> = {
  degree_Celsius: '°C',
  kelvin: 'K',
  percent: '%',
  hectopascal: 'hPa',
  'kg m-3': 'kg/m³',
  'g m-3': 'g/m³',
  'g kg-1': 'g/kg',
  'kJ kg-1': 'kJ/kg',
  meter: 'm',
  dimensionless: '',
};

const LABELS: Record<string, string> = {
  air_temperature: 'Air temperature',
  relative_humidity: 'Relative humidity',
  surface_air_pressure: 'Surface pressure',
  internal_temperature: 'Internal temperature',
  dew_point_temperature: 'Dew point',
  wet_bulb_temperature: 'Wet bulb',
  air_density: 'Air density',
  vapor_pressure: 'Vapour pressure',
  saturation_vapor_pressure: 'Saturation vapour pressure',
  absolute_humidity: 'Absolute humidity',
  specific_humidity: 'Specific humidity',
  mixing_ratio: 'Mixing ratio',
  heat_index: 'Heat index',
  potential_temperature: 'Potential temperature',
  virtual_temperature: 'Virtual temperature',
  enthalpy: 'Enthalpy',
  humidex: 'Humidex',
  lifting_condensation_level_height: 'LCL height',
};

export async function parseSkycamMet(file: File): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  if (!rows.length) return { datasets: [], warnings: [`${file.name}: empty`] };

  const headers = parsed.meta.fields ?? Object.keys(rows[0]);
  const valueCols = headers.filter((h) => h.endsWith('/value'));
  const variables: Variable[] = valueCols.map((col) => {
    const key = col.replace('/value', '');
    const unitCol = `${key}/units`;
    const firstUnit = rows[0]?.[unitCol] ?? '';
    return { key, label: LABELS[key] ?? key.replace(/_/g, ' '), unit: UNIT_MAP[firstUnit] ?? firstUnit };
  });

  const records = rows
    .map((r) => {
      const time = parseTime(r.timestamp, { sourceTz: 'utc' });
      if (!time) return null;
      const values: Record<string, number | null> = {};
      for (const col of valueCols) {
        const key = col.replace('/value', '');
        values[key] = denullNumber(r[col]);
      }
      return {
        time,
        lat: FSC_BLENCATHRA.lat,
        lon: FSC_BLENCATHRA.lon,
        values,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!records.length) return { datasets: [], warnings: [`${file.name}: no parseable rows`] };

  return {
    datasets: [
      {
        id: v4(),
        name: `Sky camera ${file.name.replace(/-WxSensor\.csv$/i, '')}`,
        source: { filename: file.name },
        kind: 'stations',
        variables,
        records,
        style: { color: '#10b981', visible: true, opacity: 1, colorBy: 'air_temperature' },
        meta: { instrument: 'Sky-camera met', sourceTz: 'utc' },
      },
    ],
    warnings: [],
  };
}
