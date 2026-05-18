import * as XLSX from 'xlsx';
import { v4 } from '../../lib/uuid';
import type { Dataset, ParseResult } from '../types';
import { GROUP_INFO } from '../types';
import { parseCoord, fixWestLon, dmsAsDecimalToDD, isInAmmssBox, AMMSS_LAT_RANGE } from '../normalise/coords';
import { parseTime } from '../normalise/time';
import { denullNumber } from '../normalise/sentinels';
import { kToC, fToC, inferTemperatureUnit } from '../normalise/units';
import { groupCodeFromFilename } from './common';

// Canonical column keys with their alias regexes.
const COLUMN_ALIASES: { key: string; label: string; unit: string; patterns: RegExp[] }[] = [
  { key: 'lat', label: 'Latitude', unit: '°', patterns: [/^lat(itude)?( \(d?d?\))?$/i] },
  { key: 'lon', label: 'Longitude', unit: '°', patterns: [/^lon(g(itude)?)?( \(d?d?\))?$/i, /^lng$/i] },
  { key: 'lat_dms', label: 'Latitude DMS', unit: '', patterns: [/^lat.* \(?dms\)?$/i] },
  { key: 'lon_dms', label: 'Longitude DMS', unit: '', patterns: [/^lon.* \(?dms\)?$/i] },
  { key: 'time', label: 'Time', unit: '', patterns: [/^time/i, /^date/i] },
  { key: 'altitude', label: 'Altitude', unit: 'm', patterns: [/^alt(itude)?( \(m\))?$/i] },
  { key: 'pressure', label: 'Pressure', unit: 'hPa', patterns: [/^pressure( \(hpa\))?$/i, /^baro/i] },
  { key: 'air_temperature', label: 'Air temperature', unit: '°C', patterns: [/turkey temperature/i, /^air temp.*$/i, /^temperature/i] },
  { key: 'air_temperature_kestrel', label: 'Air temperature (Kestrel)', unit: '°C', patterns: [/kest(re|ra)l temperature/i, /temperature from kestre?al/i] },
  { key: 'dry_bulb', label: 'Dry bulb', unit: '°C', patterns: [/dry bulb/i] },
  { key: 'wet_bulb', label: 'Wet bulb', unit: '°C', patterns: [/wet bulb/i] },
  { key: 'relative_humidity', label: 'Relative humidity', unit: '%', patterns: [/kest(re|ra)l humidity/i, /^rh.*$/i, /humidity/i] },
  { key: 'wind_speed', label: 'Wind speed', unit: 'm/s', patterns: [/average .* windspeed/i, /^max windspeed/i, /^wind speed/i] },
  { key: 'wind_direction', label: 'Wind direction', unit: '°', patterns: [/wind direction/i] },
];

function matchAlias(header: string) {
  for (const a of COLUMN_ALIASES) {
    if (a.patterns.some((p) => p.test(header.trim()))) return a;
  }
  return null;
}

export async function parseWalkWorkbook(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const group = groupCodeFromFilename(file.name) ?? undefined;
  const datasets: Dataset[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];
    if (rows.length < 3) continue;

    // Find a header row: first row with at least 3 cells matching aliases.
    let headerIdx = -1;
    let aliasMap: (typeof COLUMN_ALIASES[number] | null)[] = [];
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const map = rows[i].map((c) => (typeof c === 'string' ? matchAlias(c) : null));
      const hits = map.filter(Boolean).length;
      if (hits >= 3) {
        headerIdx = i;
        aliasMap = map;
        break;
      }
    }
    if (headerIdx === -1) {
      warnings.push(`${file.name}#${sheetName}: no recognisable header row`);
      continue;
    }
    const colMap: Record<string, number> = {};
    aliasMap.forEach((a, idx) => {
      if (a) colMap[a.key] = idx;
    });

    // Scan a column of temperature values to infer unit (K, C, F)
    const tCol = colMap['air_temperature'] ?? colMap['air_temperature_kestrel'] ?? colMap['dry_bulb'];
    let tUnit: 'C' | 'K' | 'F' | 'unknown' = 'C';
    if (tCol != null) {
      const vals = rows
        .slice(headerIdx + 1)
        .map((r) => r[tCol])
        .filter((v): v is number => typeof v === 'number');
      tUnit = inferTemperatureUnit(vals);
    }

    // Build records
    const records: NonNullable<Dataset['records']> = [];
    let flippedLonOnce = false;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const latRaw = colMap['lat'] != null ? row[colMap['lat']] : null;
      const lonRaw = colMap['lon'] != null ? row[colMap['lon']] : null;
      let lat = parseCoord(latRaw, 'lat');
      let lon = parseCoord(lonRaw, 'lon');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        // try DMS columns
        if (colMap['lat_dms'] != null) lat = parseCoord(row[colMap['lat_dms']], 'lat');
        if (colMap['lon_dms'] != null) lon = parseCoord(row[colMap['lon_dms']], 'lon');
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const fixed = fixWestLon(lon);
      if (fixed.flipped) flippedLonOnce = true;
      lon = fixed.lon;

      const alt = colMap['altitude'] != null ? denullNumber(row[colMap['altitude']]) ?? undefined : undefined;
      const time = colMap['time'] != null ? parseTime(row[colMap['time']], { sourceTz: 'utc', defaultDate: '2026-05-15' }) : undefined;

      const get = (key: string) => (colMap[key] != null ? denullNumber(row[colMap[key]]) : null);
      let t = get('air_temperature');
      if (t != null && tUnit === 'K') t = kToC(t);
      if (t != null && tUnit === 'F') t = fToC(t);
      let tk = get('air_temperature_kestrel');
      if (tk != null && tUnit === 'K') tk = kToC(tk);

      records.push({
        time,
        lat,
        lon,
        alt: alt ?? undefined,
        values: {
          air_temperature: t,
          air_temperature_kestrel: tk,
          dry_bulb: get('dry_bulb'),
          wet_bulb: get('wet_bulb'),
          relative_humidity: get('relative_humidity'),
          pressure: get('pressure'),
          wind_speed: get('wind_speed'),
          wind_direction: get('wind_direction'),
        },
      });
    }
    if (!records.length) {
      warnings.push(`${file.name}#${sheetName}: no rows with valid coordinates`);
      continue;
    }
    if (flippedLonOnce) {
      warnings.push(`${file.name}#${sheetName}: West-longitude signs flipped`);
    }

    // Sheet-level sanity check: if the parsed latitudes are outside the AMMSS
    // envelope, the cells may have been DMS-as-decimal (e.g. 54.37 meaning
    // 54° 37'). Reinterpret all records' lat/lon and adopt the result if it
    // moves the dataset back into Blencathra.
    const meanLat = records.reduce((s, r) => s + r.lat, 0) / records.length;
    if (meanLat < AMMSS_LAT_RANGE[0] || meanLat > AMMSS_LAT_RANGE[1]) {
      const reinterpreted = records.map((r) => ({
        ...r,
        lat: dmsAsDecimalToDD(r.lat),
        lon: dmsAsDecimalToDD(r.lon),
      }));
      const newMean = reinterpreted.reduce((s, r) => s + r.lat, 0) / reinterpreted.length;
      if (newMean >= AMMSS_LAT_RANGE[0] && newMean <= AMMSS_LAT_RANGE[1]) {
        records.splice(0, records.length, ...reinterpreted);
        warnings.push(`${file.name}#${sheetName}: re-parsed coordinates as DMS-as-decimal (e.g. "54.37" → 54° 37')`);
      } else {
        const stray = records.filter((r) => !isInAmmssBox(r.lat, r.lon)).length;
        warnings.push(`${file.name}#${sheetName}: ${stray}/${records.length} samples outside the Blencathra area — check coordinates`);
      }
    }

    datasets.push({
      id: v4(),
      name: `Walk ${group ?? sheetName} (${sheetName})`,
      source: { filename: file.name, sheet: sheetName },
      kind: 'track',
      variables: [
        { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
        { key: 'dry_bulb', label: 'Dry bulb', unit: '°C' },
        { key: 'wet_bulb', label: 'Wet bulb', unit: '°C' },
        { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
        { key: 'pressure', label: 'Pressure', unit: 'hPa' },
        { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
        { key: 'wind_direction', label: 'Wind direction', unit: '°' },
      ],
      records,
      style: {
        color: group ? GROUP_INFO[group].color : '#7c3aed',
        visible: true,
        opacity: 1,
        colorBy: 'air_temperature',
      },
      meta: { instrument: 'Hill traverse', group, sourceTz: 'utc' },
    });
  }

  if (!datasets.length && !warnings.length) {
    warnings.push(`${file.name}: no usable sheets`);
  }
  return { datasets, warnings };
}
