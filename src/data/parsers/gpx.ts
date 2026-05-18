import { v4 } from '../../lib/uuid';
import type { ParseResult, SampleRecord } from '../types';
import { parseTime } from '../normalise/time';

// Parses standard GPX 1.0/1.1 — emits a single Dataset combining all
// <trkpt>s as a track and all <wpt>s as a separate points dataset.
export async function parseGpx(file: File): Promise<ParseResult> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { datasets: [], warnings: [`${file.name}: invalid GPX/XML`] };
  }
  const datasets: ParseResult['datasets'] = [];

  // Track points
  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
  if (trkpts.length > 1) {
    const records: SampleRecord[] = trkpts
      .map((pt) => makeRecord(pt))
      .filter((r): r is SampleRecord => r !== null);
    if (records.length > 1) {
      datasets.push({
        id: v4(),
        name: `GPX track ${file.name}`,
        source: { filename: file.name },
        kind: 'track',
        variables: [],
        records,
        style: { color: '#22d3ee', visible: true, opacity: 0.9, colorBy: 'alt' },
        meta: { instrument: 'GPX track' },
      });
    }
  }

  // Waypoints
  const wpts = Array.from(doc.getElementsByTagName('wpt'));
  if (wpts.length) {
    const records: SampleRecord[] = wpts
      .map((pt) => {
        const r = makeRecord(pt);
        if (r) {
          const name = pt.getElementsByTagName('name')[0]?.textContent ?? '';
          r.notes = name;
          r.values.name = name;
        }
        return r;
      })
      .filter((r): r is SampleRecord => r !== null);
    if (records.length) {
      datasets.push({
        id: v4(),
        name: `GPX waypoints ${file.name}`,
        source: { filename: file.name },
        kind: 'points',
        variables: [],
        records,
        style: { color: '#06b6d4', visible: true, opacity: 1 },
        meta: { instrument: 'GPX waypoints' },
      });
    }
  }

  return {
    datasets,
    warnings: datasets.length ? [] : [`${file.name}: no track or waypoint data`],
  };
}

function makeRecord(pt: Element): SampleRecord | null {
  const lat = parseFloat(pt.getAttribute('lat') ?? '');
  const lon = parseFloat(pt.getAttribute('lon') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const eleNode = pt.getElementsByTagName('ele')[0]?.textContent ?? '';
  const timeNode = pt.getElementsByTagName('time')[0]?.textContent ?? '';
  const alt = eleNode ? parseFloat(eleNode) : undefined;
  const time = timeNode ? parseTime(timeNode, { sourceTz: 'utc' }) : undefined;
  return {
    lat,
    lon,
    alt: Number.isFinite(alt as number) ? (alt as number) : undefined,
    time,
    values: {},
  };
}
