import type { GroupCode } from '../types';

const FILENAME_GROUP = /AMMSS_G([A-Z]{2})_/i;
const FOLDER_GROUP = /\b(curiously cirrus|silver lining|mountain goat|precipitation nation|gail|gails)\b/i;

const NAME_TO_CODE: Record<string, GroupCode> = {
  CC: 'CC',
  SL: 'SL',
  MG: 'MG',
  PN: 'PN',
  GL: 'GL',
  'curiously cirrus': 'CC',
  'silver lining': 'SL',
  'silver linings': 'SL',
  'mountain goat': 'MG',
  'mountain goats': 'MG',
  'precipitation nation': 'PN',
  gail: 'GL',
  gails: 'GL',
  GAILS: 'GL',
};

export function groupCodeFromFilename(filename: string): GroupCode | null {
  const m = filename.match(FILENAME_GROUP);
  if (m) {
    const code = m[1].toUpperCase();
    if (code in NAME_TO_CODE) return NAME_TO_CODE[code];
  }
  const f = filename.match(FOLDER_GROUP);
  if (f) {
    const key = f[1].toLowerCase();
    if (key in NAME_TO_CODE) return NAME_TO_CODE[key];
  }
  const upper = filename.toUpperCase();
  if (upper.includes('GAILS')) return 'GL';
  if (upper.includes('_CC')) return 'CC';
  if (upper.includes('_PN')) return 'PN';
  if (upper.includes('_MG')) return 'MG';
  if (upper.includes('_SL')) return 'SL';
  return null;
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}
