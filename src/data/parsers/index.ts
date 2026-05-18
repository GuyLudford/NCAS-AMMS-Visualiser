import type { Dataset, ParseResult } from '../types';
import { parseUavCsv } from './uavCsv';
import { parseSondeSounding } from './sondeSounding';
import { parseSondeFlight } from './sondeFlight';
import { parseSkycamMet } from './skycamMet';
import { parseKestrel } from './kestrel';
import { parseWalkWorkbook } from './walkWorkbook';
import { parsePhoto } from './photo';
import { parseUavHdf5 } from './uavHdf5';

type Sniffer = (filename: string) => number;
type Runner = (file: File) => Promise<ParseResult>;

const ROUTES: { name: string; sniff: Sniffer; run: Runner }[] = [
  {
    name: 'UAV HDF5',
    sniff: (f) => (/AMMSS_G[A-Z]{2}_\d{8}_/.test(f) || f.endsWith('.h5') ? 1 : 0),
    run: parseUavHdf5,
  },
  {
    name: 'UAV CSV',
    sniff: (f) => (/UAV_data\w*\.csv$/i.test(f) ? 1 : 0),
    run: parseUavCsv,
  },
  {
    name: 'Sonde sounding',
    sniff: (f) => (/\.sounding\.csv$/i.test(f) ? 1 : 0),
    run: parseSondeSounding,
  },
  {
    name: 'Sonde flight',
    sniff: (f) => (/\.raw_flight_history\.csv$/i.test(f) ? 1 : 0),
    run: parseSondeFlight,
  },
  {
    name: 'Sky-camera met',
    sniff: (f) => (/WxSensor\.csv$/i.test(f) ? 1 : 0),
    run: parseSkycamMet,
  },
  {
    name: 'Kestrel',
    sniff: (f) => (/^WEATHER - /i.test(f) || /Kestrel_Data/i.test(f) ? 1 : 0),
    run: parseKestrel,
  },
  {
    name: 'Walk workbook',
    sniff: (f) => (/NCAS_AMMSS_Blencathra.*\.xlsx$/i.test(f) ? 1 : 0),
    run: parseWalkWorkbook,
  },
  {
    name: 'Photo',
    sniff: (f) => (/\.(jpe?g|heic)$/i.test(f) ? 0.5 : 0),
    run: parsePhoto,
  },
];

export async function parseFile(file: File): Promise<ParseResult> {
  let best = { score: 0, runner: null as Runner | null, name: '' };
  for (const r of ROUTES) {
    const s = r.sniff(file.name);
    if (s > best.score) best = { score: s, runner: r.run, name: r.name };
  }
  if (!best.runner) {
    return { datasets: [], warnings: [`${file.name}: no parser registered for this file type`] };
  }
  try {
    return await best.runner(file);
  } catch (err) {
    return {
      datasets: [],
      warnings: [`${file.name}: ${best.name} parser failed — ${(err as Error).message}`],
    };
  }
}

export async function parseFiles(files: File[]): Promise<{ datasets: Dataset[]; warnings: string[] }> {
  const all: Dataset[] = [];
  const allWarn: string[] = [];
  for (const f of files) {
    const r = await parseFile(f);
    all.push(...r.datasets);
    allWarn.push(...r.warnings);
  }
  return { datasets: all, warnings: allWarn };
}
