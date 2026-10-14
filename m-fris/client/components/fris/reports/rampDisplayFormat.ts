import { scheduleLabelToYmd } from '@/components/fris/reports/rampShiftTime';

/** Ramp report dates: dd-mm-yyyy. */
export function formatRampDatePart(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return s;

  const ymd = scheduleLabelToYmd(s);
  if (ymd) {
    const [y, m, d] = ymd.split('-');
    return `${d}-${m}-${y}`;
  }

  const dmY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
  if (dmY) {
    let y = dmY[3]!;
    if (y.length === 2) y = `20${y}`;
    return `${dmY[1]!.padStart(2, '0')}-${dmY[2]!.padStart(2, '0')}-${y}`;
  }

  return s;
}

function formatRampStatusLabel(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/not\s+achieved/i.test(s)) return 'NA';
  return s;
}

/** Show HH:mm only in STA/ATA/STD/ETD/ATD table cells. */
export function displayTimeOnly(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return '';

  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (timeOnly) {
    const h = Number(timeOnly[1]);
    const m = Number(timeOnly[2]);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  const tail = /(\d{1,2}):(\d{2})\s*$/.exec(s);
  if (tail) {
    const h = Number(tail[1]);
    const m = Number(tail[2]);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? '';
    const m2 = /^(\d{1,2}):(\d{2})$/.exec(last);
    if (m2) {
      const h = Number(m2[1]);
      const mi = Number(m2[2]);
      return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
  }

  return s;
}

/** PDF / display: date on first line, time(s) below (hold, diff 1st/last). */
export function formatRampDateTimeStacked(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return '—';
  if (s.includes('\n')) {
    const parts = s.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const time = displayTimeOnly(parts[parts.length - 1]!);
      return `${parts[0]}\n${time || parts[parts.length - 1]}`;
    }
  }
  const status = formatRampStatusLabel(s);
  if (status !== s) return status;
  if (/^achieved$/i.test(s)) return s;

  const dateTwoTimes =
    /^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/i.exec(s);
  if (dateTwoTimes) {
    return `${formatRampDatePart(dateTwoTimes[1]!)}\n${displayTimeOnly(dateTwoTimes[2]!)} ${displayTimeOnly(dateTwoTimes[3]!)}`;
  }

  const spaced = /^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/i.exec(s);
  if (spaced) {
    return `${formatRampDatePart(spaced[1]!)}\n${displayTimeOnly(spaced[2]!)}`;
  }

  const generic = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/i.exec(s);
  if (generic && generic[1]!.length <= 24) {
    return `${formatRampDatePart(generic[1]!)}\n${displayTimeOnly(generic[2]!)}`;
  }

  return formatRampDatePart(s);
}

export const RAMP_FLIGHT_TIME_KEYS = new Set([
  'arrivalSta',
  'arrivalEta',
  'arrivalAta',
  'depStd',
  'depEtd',
  'depAtd',
]);

export const RAMP_FLIGHT_DELAY_MIN_KEYS = new Set(['delay1Mins', 'delay2Mins']);
export const RAMP_FLIGHT_STATUS_LABEL_KEYS = new Set(['diffAta1stBag', 'diffLbAta']);

export const RAMP_FLIGHT_DATETIME_STACKED_KEYS = new Set([
  'holdOpen',
  'holdClose',
  'diff1stBag',
  'diffLastBag',
]);

/** Format one ramp flight table cell for UI, view, and PDF. */
export function formatRampFlightCellDisplay(key: string, raw: string): string {
  if (key === 'arrivalEtaAta') {
    const parts = String(raw ?? '')
      .split(/\s*\/\s*/)
      .map((p) => {
        const t = p.trim();
        if (!t || t === '—') return '';
        const stacked = formatRampDateTimeStacked(t);
        if (stacked.includes('\n')) return stacked;
        return displayTimeOnly(t) || t;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '—';
  }
  if (RAMP_FLIGHT_DATETIME_STACKED_KEYS.has(key)) return formatRampDateTimeStacked(raw);
  if (RAMP_FLIGHT_TIME_KEYS.has(key)) return displayTimeOnly(raw) || '—';
  if (RAMP_FLIGHT_DELAY_MIN_KEYS.has(key)) return formatDelayMinutesDisplay(raw);
  if (RAMP_FLIGHT_STATUS_LABEL_KEYS.has(key)) {
    const t = String(raw ?? '').trim();
    if (!t) return '—';
    return formatRampStatusLabel(t);
  }
  const t = String(raw ?? '').trim();
  return t || '—';
}

/** Delay minute cells: empty → 00:00. */
export function formatDelayMinutesDisplay(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return '00:00';
  const colon = /^(\d{1,3}):(\d{2})$/.exec(s.replace(/\./g, ':'));
  if (colon) {
    return `${colon[1]}:${colon[2]}`;
  }
  return s;
}
