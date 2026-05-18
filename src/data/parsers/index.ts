import type { Dataset, ParseResult } from '../types';
import { parseUavCsv } from './uavCsv';
import { parseUavXlsx } from './uavXlsx';
import { parseSondeSounding } from './sondeSounding';
import { parseSondeFlight } from './sondeFlight';
import { parseSondeRaw } from './sondeRaw';
import { parseSondeRawHistory } from './sondeRawHistory';
import { parseSharppy } from './sharppy';
import { parseKml } from './kml';
import { parseGpx } from './gpx';
import { parseSkycamMet } from './skycamMet';
import { parseKestrel } from './kestrel';
import { parseKestrelCal } from './kestrelCal';
import { parseWalkWorkbook } from './walkWorkbook';
import { parsePhoto } from './photo';
import { parseUavHdf5 } from './uavHdf5';
import { parseBackpack } from './backpack';
import { parseHobo } from './hobo';
import { parseHoboXlsx } from './hoboXlsx';
import { parseAttachment } from './attachment';
import { parseWindsondXlsx } from './windsondXlsx';

type Sniffer = (filename: string) => number;
type Runner = (file: File) => Promise<ParseResult>;

// Order matters: more specific filename patterns must win over generic
// extension-only matches.
const ROUTES: { name: string; sniff: Sniffer; run: Runner }[] = [
  { name: 'UAV HDF5', sniff: (f) => (/AMMSS_G[A-Z]{2}_\d{8}_/.test(f) || f.toLowerCase().endsWith('.h5') ? 1 : 0), run: parseUavHdf5 },
  { name: 'UAV CSV', sniff: (f) => (/UAV_data\w*\.csv$/i.test(f) || /drone flight data.*\.csv$/i.test(f) ? 1 : 0), run: parseUavCsv },
  { name: 'UAV XLSX', sniff: (f) => (/drone flight data.*\.xlsx$/i.test(f) || /UAV_data\w*\.xlsx$/i.test(f) ? 1 : 0), run: parseUavXlsx },
  { name: 'Sonde sounding', sniff: (f) => (/\.sounding\.csv$/i.test(f) ? 1 : 0), run: parseSondeSounding },
  { name: 'Windsond XLSX', sniff: (f) => (/\.(sounding|raw_flight_history|raw_history|raw)(\(\d+\))?\.xlsx$/i.test(f) ? 1 : 0), run: parseWindsondXlsx },
  { name: 'Sonde flight history', sniff: (f) => (/\.raw_flight_history\.csv$/i.test(f) ? 1 : 0), run: parseSondeFlight },
  { name: 'Sonde history', sniff: (f) => (/\.raw_history\.csv$/i.test(f) ? 1 : 0), run: parseSondeRawHistory },
  { name: 'Sonde raw', sniff: (f) => (/\.raw\.csv$/i.test(f) ? 1 : 0), run: parseSondeRaw },
  { name: 'SharpPy', sniff: (f) => (/\.sharppy\.txt$/i.test(f) ? 1 : 0), run: parseSharppy },
  { name: 'KML', sniff: (f) => (/\.kml$/i.test(f) ? 1 : 0), run: parseKml },
  { name: 'GPX', sniff: (f) => (/\.gpx$/i.test(f) ? 1 : 0), run: parseGpx },
  { name: 'Sky-camera met', sniff: (f) => (/WxSensor\.csv$/i.test(f) ? 1 : 0), run: parseSkycamMet },
  { name: 'HOBO XLSX', sniff: (f) => (/^\d{6,}.*\.xlsx$/i.test(f) || /HOBO.*\.xlsx$/i.test(f) ? 1 : 0), run: parseHoboXlsx },
  { name: 'HOBO reference', sniff: (f) => (/^\d{6,}\s+\d{4}-\d{2}-\d{2}[\s_]/.test(f) || /HOBO/i.test(f) ? 1 : 0), run: parseHobo },
  { name: 'Kestrel calibration', sniff: (f) => (/^cal\.(csv|xlsx)$/i.test(f) ? 1 : 0), run: parseKestrelCal },
  { name: 'Kestrel', sniff: (f) => (/^WEATHER - /i.test(f) || /Kestrel_Data/i.test(f) ? 1 : 0), run: parseKestrel },
  { name: 'Backpack logger', sniff: (f) => (/^log_data_\w+_\d{4}-\d{2}-\d{2}\.txt$/i.test(f) ? 1 : 0), run: parseBackpack },
  { name: 'Walk workbook', sniff: (f) => (/NCAS_AMMSS_Blencathra.*\.xlsx$/i.test(f) ? 1 : 0), run: parseWalkWorkbook },
  { name: 'Photo', sniff: (f) => (/\.(jpe?g|heic)$/i.test(f) ? 0.5 : 0), run: parsePhoto },
  // Attachments (last-resort for image/document/proprietary-log types)
  { name: 'Attachment', sniff: (f) => (/\.(png|pdf|pptx|ppt|sounding)$/i.test(f) ? 0.4 : 0), run: parseAttachment },
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
    const result = await best.runner(file);
    // Photo parser succeeded but the JPG had no GPS — fall back to attachment.
    if (best.name === 'Photo' && result.datasets.length === 0) {
      return await parseAttachment(file);
    }
    return result;
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
