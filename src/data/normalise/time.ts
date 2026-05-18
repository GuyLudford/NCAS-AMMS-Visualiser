import { DateTime } from 'luxon';

// Convert anything we've seen ("YYYY-MM-DDTHH:mm:ss.sssZ", "YYYY-MM-DD HH:MM",
// bare "HH:MM:SS", Excel serial, BST date strings, Unix epoch seconds) into
// ISO-8601 UTC. Returns undefined when nothing makes sense.

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_SPACE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
const HHMMSS = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;
const DATE_TIME_US = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;

export interface TimeContext {
  defaultDate?: string; // 'YYYY-MM-DD' for bare HH:MM
  sourceTz?: string; // luxon zone name; default UTC
}

export function parseTime(raw: unknown, ctx: TimeContext = {}): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === 'number') {
    // Excel serial date if small, Unix epoch seconds if huge, ms if huger
    if (raw > 1e12) return DateTime.fromMillis(raw, { zone: 'utc' }).toISO() ?? undefined;
    if (raw > 1e9) return DateTime.fromSeconds(raw, { zone: 'utc' }).toISO() ?? undefined;
    if (raw > 25569 && raw < 80000) {
      // Excel serial (days since 1899-12-30)
      const epoch = DateTime.fromObject({ year: 1899, month: 12, day: 30 }, { zone: 'utc' });
      return epoch.plus({ days: raw }).toISO() ?? undefined;
    }
    return undefined;
  }

  const s = String(raw).trim();
  if (!s) return undefined;

  if (ISO.test(s)) {
    return DateTime.fromISO(s, { zone: ctx.sourceTz ?? 'utc' }).toUTC().toISO() ?? undefined;
  }
  if (ISO_SPACE.test(s)) {
    const formats = [
      "yyyy-MM-dd HH:mm:ss.SSS",
      "yyyy-MM-dd HH:mm:ss.S",
      "yyyy-MM-dd HH:mm:ss",
      "yyyy-MM-dd HH:mm",
    ];
    for (const fmt of formats) {
      const dt = DateTime.fromFormat(s, fmt, { zone: ctx.sourceTz ?? 'utc' });
      if (dt.isValid) return dt.toUTC().toISO() ?? undefined;
    }
    // Last-ditch: replace space with T and try ISO
    const iso = DateTime.fromISO(s.replace(' ', 'T'), { zone: ctx.sourceTz ?? 'utc' });
    if (iso.isValid) return iso.toUTC().toISO() ?? undefined;
  }

  let m = s.match(HHMMSS);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(m[3] ?? '0');
    const date = ctx.defaultDate ?? '2026-05-15';
    return DateTime.fromObject(
      {
        year: parseInt(date.slice(0, 4), 10),
        month: parseInt(date.slice(5, 7), 10),
        day: parseInt(date.slice(8, 10), 10),
        hour: h,
        minute: min,
        second: Math.floor(sec),
        millisecond: Math.round((sec - Math.floor(sec)) * 1000),
      },
      { zone: ctx.sourceTz ?? 'utc' },
    )
      .toUTC()
      .toISO() ?? undefined;
  }

  m = s.match(DATE_TIME_US);
  if (m) {
    // HOBO uses MM/DD/YYYY in BST
    return DateTime.fromFormat(s, 'MM/dd/yyyy HH:mm:ss', { zone: ctx.sourceTz ?? 'Europe/London' }).toUTC().toISO() ?? undefined;
  }

  // Fallback: let luxon try a few formats
  const tries = [DateTime.fromISO(s), DateTime.fromRFC2822(s), DateTime.fromHTTP(s)];
  for (const t of tries) if (t.isValid) return t.toUTC().toISO() ?? undefined;

  return undefined;
}
