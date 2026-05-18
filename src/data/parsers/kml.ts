import { v4 } from '../../lib/uuid';
import type { ParseResult } from '../types';

// Parses Windsond/Generic KML to extract Placemarks (LineString tracks +
// waypoints). Coordinates in KML are "lon,lat[,alt]" — we keep alt.
export async function parseKml(file: File): Promise<ParseResult> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { datasets: [], warnings: [`${file.name}: invalid XML`] };
  }

  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  const points: NonNullable<ParseResult['datasets'][number]['records']> = [];
  const trackCoords: { lat: number; lon: number; alt?: number }[] = [];
  let trackName = '';

  for (const pm of placemarks) {
    const name = pm.getElementsByTagName('name')[0]?.textContent ?? '';
    const lineCoords = pm.getElementsByTagName('LineString')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    if (lineCoords) {
      trackName = name;
      for (const triplet of lineCoords.trim().split(/\s+/)) {
        const parts = triplet.split(',').map(parseFloat);
        if (parts.length >= 2 && parts.every(Number.isFinite)) {
          trackCoords.push({ lon: parts[0], lat: parts[1], alt: parts[2] });
        }
      }
    }
    const ptCoords = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    if (ptCoords) {
      const parts = ptCoords.trim().split(',').map(parseFloat);
      if (parts.length >= 2 && parts.every(Number.isFinite)) {
        points.push({
          lat: parts[1],
          lon: parts[0],
          alt: parts[2],
          values: { name },
          notes: name,
        });
      }
    }
  }

  // Windsond KMLs reference windsond.com in their style icons — treat them
  // as a sonde track so they group with the other sonde data in the sidebar.
  const isWindsond = /windsond\.com/i.test(text);
  const instrumentTrack = isWindsond ? 'Windsond KML' : 'KML track';
  const instrumentPoint = isWindsond ? 'Windsond KML waypoints' : 'KML waypoints';

  const datasets: ParseResult['datasets'] = [];
  if (trackCoords.length > 1) {
    datasets.push({
      id: v4(),
      name: `${isWindsond ? 'Sonde KML' : 'KML track'} ${trackName || file.name}`,
      source: { filename: file.name },
      kind: 'track',
      variables: [],
      records: trackCoords.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        alt: p.alt,
        values: {},
      })),
      style: { color: isWindsond ? '#a855f7' : '#22d3ee', visible: true, opacity: 0.9, colorBy: 'alt' },
      meta: { instrument: instrumentTrack, sourceTz: 'utc', altitudeRef: 'MSL' },
    });
  }
  if (points.length) {
    datasets.push({
      id: v4(),
      name: `${isWindsond ? 'Sonde KML waypoints' : 'KML waypoints'} ${file.name}`,
      source: { filename: file.name },
      kind: 'points',
      variables: [],
      records: points,
      style: { color: isWindsond ? '#d946ef' : '#fb7185', visible: true, opacity: 1 },
      meta: { instrument: instrumentPoint },
    });
  }
  return { datasets, warnings: datasets.length ? [] : [`${file.name}: no placemarks found`] };
}
