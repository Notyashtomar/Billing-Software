/** Date helpers for billing sources (mirrors AdvanceInvoicingService). */

export function queryParamToYmd(input?: string): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return null;
}

export function ymdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Inclusive YYYY-MM-DD range for billing source queries. */
export function enumerateYmdRange(
  fromYmd: string,
  toYmd: string,
  maxDays = 366,
): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  let guard = 0;
  while (cur <= toYmd && guard < maxDays) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
    guard += 1;
  }
  return out;
}

/** Creation RAF stores operating days as dd/MM/yyyy — map billing window to that shape. */
export function enumerateDdMmYyyyFromYmdRange(
  fromYmd: string,
  toYmd: string,
  maxDays = 366,
): string[] {
  return enumerateYmdRange(fromYmd, toYmd, maxDays)
    .map((ymd) => ymdToDdMmYyyy(ymd))
    .filter(Boolean);
}

export function ddMmYyyyToYmd(raw: string): string | null {
  return queryParamToYmd(raw);
}

export function addDaysYmd(ymd: string, delta: number): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

export function isCancelledFlight(data: Record<string, unknown>): boolean {
  return (
    data.isCancelled === true ||
    data.flightCancelled === true ||
    String(data.flightStatus ?? '')
      .trim()
      .toLowerCase() === 'cancelled' ||
    /^canc[\s-]/i.test(String(data.flightNo ?? data['Flight No'] ?? ''))
  );
}

/** Whether a schedule flight number is marked cancelled (CANC prefix). */
export function isScheduleFlightNoCancelled(raw: unknown): boolean {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .startsWith('CANC');
}

/**
 * Parity with FRIS Scheduled Airlines — daily flags plus daily vs resolved flight numbers.
 */
export function resolveScheduledFlightCancelled(
  dailyData: Record<string, unknown> | undefined,
  resolvedFlightNo: string,
): boolean {
  const dailyFlightNo = pick(
    dailyData?.flightNo,
    dailyData?.['Flight No'],
    dailyData?.FlightNo,
  );
  const flightNos = [resolvedFlightNo, dailyFlightNo].filter(Boolean);

  if (dailyData) {
    if (
      dailyData.isCancelled === true ||
      dailyData.flightCancelled === true ||
      dailyData['Is Cancelled'] === true ||
      String(dailyData.flightStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    ) {
      return true;
    }
  }

  return flightNos.some((fn) => isScheduleFlightNoCancelled(fn));
}

export type BillingScheduledDateBasis =
  | 'schedule-date'
  | 'atd-date'
  | 'exported-date';

/** Whether a billing operational row is cancelled (parity with Scheduled Airlines). */
export function isBillingOperationalRowCancelled(
  operationalData: Record<string, unknown>,
  flightNo?: string,
): boolean {
  const resolved = String(
    flightNo ??
      operationalData.flightNoEquipmentNo ??
      operationalData.flightNo ??
      operationalData['Flight No'] ??
      '',
  );
  return resolveScheduledFlightCancelled(operationalData, resolved);
}

/**
 * Billing window date — schedule-date matches Scheduled Airlines (STA); cancelled never use ATD.
 */
export function scheduledFlightBillingWindowYmd(
  dailyData: Record<string, unknown>,
  dates: {
    atdYmd: string | null;
    staYmd: string | null;
    stdYmd: string | null;
    exportedYmd: string | null;
    scheduleYmd?: string | null;
  },
  dateBasis?: BillingScheduledDateBasis | null,
): string | null {
  const basis = dateBasis ?? 'schedule-date';

  if (basis === 'exported-date') {
    return dates.exportedYmd;
  }

  if (basis === 'schedule-date') {
    return dates.staYmd ?? dates.stdYmd ?? dates.scheduleYmd ?? null;
  }

  const cancelled = isCancelledFlight(dailyData);
  if (cancelled) {
    return dates.staYmd ?? dates.stdYmd ?? dates.scheduleYmd ?? null;
  }

  return dates.atdYmd ?? dates.staYmd ?? dates.stdYmd;
}

export function normalizeBillingScheduledDateBasis(
  raw?: string | null,
): BillingScheduledDateBasis {
  if (raw === 'atd-date' || raw === 'exported-date') return raw;
  return 'schedule-date';
}
