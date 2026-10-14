/**
 * Derive stable identity + source metadata for one legacy daily-from-advance row.
 */

export function ymdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function eachYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  const start = parseYmd(fromYmd);
  const end = parseYmd(toYmd);
  if (!start || !end || start > end) return out;
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push(dateToYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize STA date from row.data into yyyy-MM-dd when possible. */
export function staYmdFromDailyData(
  data: Record<string, unknown>,
  fallbackYmd: string,
): string {
  const raw = String(
    data.staDate ?? data.STADate ?? data.operationDate ?? '',
  ).trim();
  if (!raw) return fallbackYmd;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return fallbackYmd;
}

export type ScheduledDailySourceType =
  | 'fhr'
  | 'advance'
  | 'creation'
  | 'additional';

export function sourceTypeFromDailyData(
  data: Record<string, unknown>,
): ScheduledDailySourceType {
  const handling = String(
    data.TypeofHandling ?? data.typeOfHandling ?? data['Type of Handling'] ?? '',
  )
    .trim()
    .toLowerCase();
  if (handling.includes('additional')) return 'additional';
  const scheduleId = String(data.scheduleId ?? '').trim().toLowerCase();
  if (scheduleId.startsWith('fhr_collection_') || scheduleId.startsWith('fhr_')) {
    return 'fhr';
  }
  const sync = String(data.dailySyncSource ?? data._source ?? '')
    .trim()
    .toLowerCase();
  if (sync.includes('creation')) return 'creation';
  if (sync.includes('additional')) return 'additional';
  if (sync.includes('fhr')) return 'fhr';
  return 'advance';
}

export function identityKeyFromDailyData(
  data: Record<string, unknown>,
): string {
  const serial = String(
    data.SlNo ??
      data.slNo ??
      data.serialNo ??
      data.SerialNo ??
      data['Serial No'] ??
      '',
  ).trim();
  if (serial) return `ser:${serial}`;

  const scheduleId = String(data.scheduleId ?? '').trim();
  if (scheduleId) return `sch:${scheduleId}`;

  const airline = String(data.airline ?? data.Airline ?? '')
    .trim()
    .toUpperCase();
  const flightNo = String(data.flightNo ?? data.FlightNo ?? '')
    .trim()
    .toUpperCase();
  const staTime = String(data.staTime ?? data.STATime ?? '').trim();
  return `fb:${airline}|${flightNo}|${staTime}`;
}

export function pickRowStatus(data: Record<string, unknown>): string {
  return String(
    data.rowStatus ?? data.status ?? data.Status ?? '',
  ).trim();
}

export function pickAirline(data: Record<string, unknown>): string {
  return String(data.airline ?? data.Airline ?? '').trim();
}

export function pickFlightNo(data: Record<string, unknown>): string {
  return String(data.flightNo ?? data.FlightNo ?? '').trim();
}

export function pickSerialNo(data: Record<string, unknown>): string {
  return String(
    data.SlNo ?? data.slNo ?? data.serialNo ?? data.SerialNo ?? '',
  ).trim();
}

export function pickScheduleId(data: Record<string, unknown>): string {
  return String(data.scheduleId ?? '').trim();
}

export function rebuildDayCoalesceKey(
  stationCode: string,
  staYmd: string,
): string {
  return `${String(stationCode).trim().toUpperCase()}|${staYmd}|rebuild_day`;
}
