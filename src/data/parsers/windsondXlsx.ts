import * as XLSX from 'xlsx';
import { parseSondeSounding } from './sondeSounding';
import { parseSondeFlight } from './sondeFlight';
import { parseSondeRaw } from './sondeRaw';
import { parseSondeRawHistory } from './sondeRawHistory';
import type { ParseResult } from '../types';

// Convert a Windsond XLSX export to its CSV-equivalent string and route to
// the existing CSV parser based on the column headers.
export async function parseWindsondXlsx(file: File): Promise<ParseResult> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { datasets: [], warnings: [`${file.name}: empty workbook`] };
  let csv = XLSX.utils.sheet_to_csv(sheet);

  // Sounding XLSX prefixes the header comment line with the lat/lon/utc_time
  // params split into separate cells — re-join them as a "#"-prefixed line
  // so sondeSounding can extract them from the first three rows.
  const firstFew = csv.split(/\r?\n/, 5).join('\n');
  const isSounding = /Height \(m AGL\)/i.test(firstFew);
  const isFlight = /UTC time/i.test(firstFew) && /Altitude \(m MSL\)/i.test(firstFew) && /Latitude/i.test(firstFew);
  const isRawHistory = /UTC time/i.test(firstFew) && /Altitude \(m MSL\)/i.test(firstFew) && !isFlight;
  const isRaw = !isSounding && !isFlight && !isRawHistory && /Altitude \(m MSL\)/i.test(firstFew);

  const newName = file.name.replace(/\.xlsx$/i, '.csv').replace(/\(1\)/, '');
  const surrogate = makeFileLike(csv, newName);

  if (isSounding) return parseSondeSounding(surrogate);
  if (isFlight) return parseSondeFlight(surrogate);
  if (isRawHistory) return parseSondeRawHistory(surrogate);
  if (isRaw) return parseSondeRaw(surrogate);
  return { datasets: [], warnings: [`${file.name}: unrecognised Windsond XLSX schema`] };
}

// Minimal File-like duck object. We only need .name and .text() — works in
// both the browser (real File) and the node smoke test (polyfilled File).
function makeFileLike(text: string, name: string): File {
  return {
    name,
    size: text.length,
    type: 'text/csv',
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  } as unknown as File;
}
