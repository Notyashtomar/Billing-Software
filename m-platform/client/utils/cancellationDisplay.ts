import type { FlightCancellationRecord } from '@/lib/api';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse ISO or dd/MM/yyyy display dates to yyyy-MM-dd (server parity). */
export function tryParseCancellationDateToYmd(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (YMD_RE.test(raw)) return raw;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function ymdInInclusiveRange(ymd: string, from: string, to: string): boolean {
  return ymd >= from && ymd <= to;
}

/**
 * True when a cancellation row belongs in `[fromYmd, toYmd]` inclusive.
 * Uses the history **Cancellation date** (`cancelledDate`). STA / STD are
 * fallbacks only when that field is missing, so a June cancel with an
 * August schedule STA does not appear in an August filter.
 */
export function cancellationRowInDateRange(
  row: FlightCancellationRecord,
  fromYmd: string,
  toYmd: string,
): boolean {
  const from = String(fromYmd ?? '').trim();
  const to = String(toYmd ?? '').trim();
  if (!YMD_RE.test(from) || !YMD_RE.test(to) || from > to) return false;

  const cancelY = tryParseCancellationDateToYmd(String(row.cancelledDate ?? ''));
  if (cancelY) return ymdInInclusiveRange(cancelY, from, to);

  const staY = tryParseCancellationDateToYmd(String(row.staDate ?? ''));
  if (staY) return ymdInInclusiveRange(staY, from, to);

  const stdY = tryParseCancellationDateToYmd(String(row.stdDate ?? ''));
  if (stdY) return ymdInInclusiveRange(stdY, from, to);

  return false;
}

/** yyyy-MM-dd → dd/MM/yyyy (matches cancellation history page). */
export function ymdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Route label: stored route, else source — destination (cancellation history parity). */
export function displayCancellationRoute(row: FlightCancellationRecord): string {
  const r = String(row.route ?? '').trim();
  if (r) return r;
  const s = String(row.source ?? '').trim();
  const t = String(row.destination ?? '').trim();
  if (s && t) return `${s} - ${t}`;
  if (s) return s;
  if (t) return t;
  return '—';
}
