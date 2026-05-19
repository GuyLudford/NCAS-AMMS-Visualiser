// Synthetic demo data so the deployed page is useful without dropping any
// files. Realistic enough to exercise every renderer: a UAV climb at the
// FSC, a sonde profile, a walk traverse, and a sky-camera time series.
import { v4 } from '../lib/uuid';
import type { Dataset } from './types';
import { GROUP_INFO } from './types';
import { FSC_BLENCATHRA } from './normalise/coords';

const FSC = { lat: FSC_BLENCATHRA.lat, lon: FSC_BLENCATHRA.lon };

export function buildDemoData(): Dataset[] {
  return [demoUav(), demoSonde(), demoWalk(), demoSkycam()];
}

function demoUav(): Dataset {
  // Drone climbs from FSC carpark (270 m) to 400 m over ~3 minutes
  const records = [];
  const t0 = Date.parse('2026-05-13T13:30:00Z');
  for (let i = 0; i < 120; i++) {
    const t = t0 + i * 1500;
    const alt = 270 + i * 1.1 + Math.sin(i / 8) * 2;
    const temp = 14 - (alt - 270) / 100 * 0.65;
    records.push({
      time: new Date(t).toISOString(),
      lat: FSC.lat + 0.0001,
      lon: FSC.lon + 0.0001,
      alt,
      values: {
        air_temperature: temp,
        relative_humidity: 60 + Math.cos(i / 12) * 6,
        pressure: 1013.25 * Math.pow(1 - 0.0065 * alt / 288.15, 5.255),
        speed: 0.2 + Math.abs(Math.sin(i / 5)) * 0.6,
        roll: Math.sin(i / 3),
        pitch: 1 + Math.cos(i / 4),
        yaw: (i * 4) % 360,
      },
    });
  }
  return {
    id: v4(),
    name: 'Demo · UAV climb (synthetic)',
    source: { filename: 'demo-uav.json' },
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
    style: { color: GROUP_INFO.CC.color, visible: true, opacity: 1, colorBy: 'alt' },
    meta: { instrument: 'UAV', sourceTz: 'utc', demo: true },
  };
}

function demoSonde(): Dataset {
  // Realistic vertical profile: surface T 14°C, lapse rate 6.5°C/km, RH
  // dropping with height. Wind veering with altitude.
  const records = [];
  for (let h = 0; h <= 3000; h += 30) {
    const T = 14 - h * 0.0065 + (h > 1500 ? -2 : 0); // slight inversion ~1500m
    const Td = T - 4 - h * 0.001;
    const e = 6.112 * Math.exp((17.67 * Td) / (Td + 243.5));
    const p = 1013.25 * Math.pow(1 - 0.0065 * h / 288.15, 5.255);
    const rh = (e / (6.112 * Math.exp((17.67 * T) / (T + 243.5)))) * 100;
    records.push({
      time: '2026-05-15T10:41:00Z',
      lat: FSC.lat,
      lon: FSC.lon,
      alt: h,
      values: {
        air_temperature: T,
        dew_point: Td,
        relative_humidity: rh,
        pressure: p,
        wind_speed: 3 + h / 500,
        wind_direction: (200 + h / 30) % 360,
      },
    });
  }
  return {
    id: v4(),
    name: 'Demo · Sonde profile (synthetic)',
    source: { filename: 'demo-sonde.json' },
    kind: 'profile',
    variables: [
      { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
      { key: 'dew_point', label: 'Dew point', unit: '°C' },
      { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
      { key: 'pressure', label: 'Pressure', unit: 'hPa' },
      { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
      { key: 'wind_direction', label: 'Wind direction', unit: '°' },
    ],
    records,
    style: { color: '#a855f7', visible: true, opacity: 0.9, colorBy: 'relative_humidity' },
    meta: { instrument: 'Windsond (SharpPy)', sourceTz: 'utc', demo: true },
  };
}

function demoWalk(): Dataset {
  // Path from FSC up the southern flank — six waypoints in a line
  const points = [
    { lat: 54.621, lon: -3.0815, alt: 287, T: 8.0 },
    { lat: 54.6225, lon: -3.0795, alt: 360, T: 7.3 },
    { lat: 54.624, lon: -3.0775, alt: 460, T: 6.4 },
    { lat: 54.6255, lon: -3.0755, alt: 560, T: 5.2 },
    { lat: 54.627, lon: -3.0735, alt: 660, T: 4.1 },
    { lat: 54.6285, lon: -3.0715, alt: 760, T: 3.0 },
  ];
  const t0 = Date.parse('2026-05-15T09:00:00Z');
  const records = points.map((p, i) => ({
    time: new Date(t0 + i * 15 * 60 * 1000).toISOString(),
    lat: p.lat,
    lon: p.lon,
    alt: p.alt,
    values: {
      air_temperature: p.T,
      relative_humidity: 60 + i * 4,
      pressure: 1013.25 * Math.pow(1 - 0.0065 * p.alt / 288.15, 5.255),
      wet_bulb: p.T - 1,
      dry_bulb: p.T + 0.2,
      wind_speed: 3 + i * 0.5,
      wind_direction: 250 - i * 5,
    },
  }));
  return {
    id: v4(),
    name: 'Demo · Walk traverse (synthetic)',
    source: { filename: 'demo-walk.json' },
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
    style: { color: GROUP_INFO.GL.color, visible: true, opacity: 1, colorBy: 'air_temperature' },
    meta: { instrument: 'Hill traverse', group: 'GL', sourceTz: 'utc', demo: true },
  };
}

function demoSkycam(): Dataset {
  // 24 hours of one-minute sky-camera met at the FSC
  const records = [];
  const t0 = Date.parse('2026-05-13T00:00:00Z');
  for (let i = 0; i < 1440; i++) {
    const t = t0 + i * 60 * 1000;
    const hour = (i / 60) % 24;
    const T = 9 + 4 * Math.cos(((hour - 14) / 24) * Math.PI * 2);
    const rh = 70 - 15 * Math.cos(((hour - 14) / 24) * Math.PI * 2);
    records.push({
      time: new Date(t).toISOString(),
      lat: FSC.lat,
      lon: FSC.lon,
      values: {
        air_temperature: T,
        relative_humidity: rh,
        surface_air_pressure: 975 + Math.sin(i / 240) * 2,
        dew_point_temperature: T - 4,
        wet_bulb_temperature: T - 2,
      },
    });
  }
  return {
    id: v4(),
    name: 'Demo · Sky-camera met (synthetic)',
    source: { filename: 'demo-skycam.json' },
    kind: 'stations',
    variables: [
      { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
      { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
      { key: 'surface_air_pressure', label: 'Surface pressure', unit: 'hPa' },
      { key: 'dew_point_temperature', label: 'Dew point', unit: '°C' },
      { key: 'wet_bulb_temperature', label: 'Wet bulb', unit: '°C' },
    ],
    records,
    style: { color: '#10b981', visible: true, opacity: 1, colorBy: 'air_temperature' },
    meta: { instrument: 'Sky-camera met', sourceTz: 'utc', demo: true },
  };
}
