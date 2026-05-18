import exifr from 'exifr';
import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';

export async function parsePhoto(file: File): Promise<ParseResult> {
  let lat: number | undefined;
  let lon: number | undefined;
  try {
    const gps = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | undefined;
    lat = gps?.latitude;
    lon = gps?.longitude;
  } catch {
    /* no exif */
  }
  if (lat == null || lon == null) {
    return { datasets: [], warnings: [`${file.name}: no EXIF GPS`] };
  }
  const url = URL.createObjectURL(file);
  return {
    datasets: [
      {
        id: v4(),
        name: file.name,
        source: { filename: file.name },
        kind: 'photos',
        variables: [],
        records: [{ lat, lon, values: {} }],
        style: { color: '#facc15', visible: true, opacity: 1 },
        meta: {
          instrument: 'Photo',
          attachmentUrl: url,
          attachmentType: file.type || 'image/jpeg',
        },
      },
    ],
    warnings: [],
  };
}
