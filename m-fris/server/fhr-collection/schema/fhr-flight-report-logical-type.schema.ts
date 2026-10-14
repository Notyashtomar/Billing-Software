export type FhrFlightReportLogicalType =
  | 'TEXT'
  | 'INTEGER'
  | 'FLAG'
  | 'DATE_DD_MM_YYYY'
  | 'TIME_24_HOURS'
  | 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS'
  | 'DURATION_HH_MM';

/**
 * Logical data types expected for FHR report payload fields sourced from `fhr_collection`.
 * Keys match `ReportAggregationService.getFlightReportData()` response keys.
 */
export const FHR_COLLECTION_FLIGHT_REPORT_LOGICAL_SCHEMA: Record<
  string,
  FhrFlightReportLogicalType
> = {
  turnaroundStatus: 'TEXT',
  typeOfHandling: 'TEXT',
  mtow: 'INTEGER',
  baseFlight: 'FLAG',
  terminalCode: 'TEXT',
  serialNoDisplay: 'TEXT',
  airlineName: 'TEXT',
  ops: 'TEXT',
  flightNo: 'TEXT',
  aircraftType: 'TEXT',
  aircraftRegnNo: 'TEXT',
  staDate: 'DATE_DD_MM_YYYY',
  staTime: 'TIME_24_HOURS',
  ataDate: 'DATE_DD_MM_YYYY',
  ataTime: 'TIME_24_HOURS',
  stdDate: 'DATE_DD_MM_YYYY',
  stdTime: 'TIME_24_HOURS',
  atdDate: 'DATE_DD_MM_YYYY',
  atdTime: 'TIME_24_HOURS',
  etdTime: 'TIME_24_HOURS',
  bayNo: 'TEXT',
  gateNo: 'TEXT',
  routing: 'TEXT',
  totalDelay: 'DURATION_HH_MM',
  status: 'TEXT',
  igmNo: 'TEXT',
  egmNo: 'TEXT',
  adcNo: 'TEXT',
  ficNo: 'TEXT',
  bookingNo: 'TEXT',
  challanNo: 'TEXT',
  iposDate: 'DATE_DD_MM_YYYY',
  iposTime: 'TIME_24_HOURS',
  cntOpenedTime: 'TIME_24_HOURS',
  cntClosedTime: 'TIME_24_HOURS',
  boardingOpenedTime: 'TIME_24_HOURS',
  boardingClosedTime: 'TIME_24_HOURS',
  arrivalPax: 'INTEGER',
  departurePax: 'INTEGER',
  arrivalBag: 'INTEGER',
  departureBag: 'INTEGER',
  cleaningFromTime: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cleaningToTime: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cleaningDuration: 'DURATION_HH_MM',
  cleaning_duration: 'DURATION_HH_MM',
  cargoCompartmentFrontOpen: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentFrontClose: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentRearOpen: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentRearClose: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentBulkOpen: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentBulkClose: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentMainOpen: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  cargoCompartmentMainClose: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  lastActivityTimeOnHold: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  transitCargo: 'INTEGER',
  uldCargoArrived: 'INTEGER',
  uldCargoPlanned: 'INTEGER',
  uldCargoDeparted: 'INTEGER',
  cargoArrived: 'INTEGER',
  cargoPlanned: 'INTEGER',
  cargoDeparted: 'INTEGER',
  mailArrived: 'INTEGER',
  mailPlanned: 'INTEGER',
  mailDeparted: 'INTEGER',
  cargoPcsIn: 'INTEGER',
  cargoPcsOut: 'INTEGER',
  courierIn: 'INTEGER',
  courierOut: 'INTEGER',
  cabinConfigF: 'INTEGER',
  cabinConfigC: 'INTEGER',
  cabinConfigY: 'INTEGER',
  ldc: 'INTEGER',
  ldp: 'INTEGER',
  mdp: 'INTEGER',
  firstArrHall: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  lastArrHall: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  firstBMA: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  lastBMA: 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS',
  holdConfig: 'TEXT',
  wheelChairArrivalC: 'INTEGER',
  wheelChairArrivalS: 'INTEGER',
  wheelChairArrivalR: 'INTEGER',
  wheelChairDepartureC: 'INTEGER',
  wheelChairDepartureS: 'INTEGER',
  wheelChairDepartureR: 'INTEGER',
  ghRemarks: 'TEXT',
  airlineRemarks: 'TEXT',
  ghRepresentativeName: 'TEXT',
  airlineRepresentativeName: 'TEXT',
  verifiedBy: 'TEXT',
};

function asTrimmedString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function datePartsFromUnknown(v: unknown): {
  day: number;
  month: number;
  year: number;
} | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return {
      day: v.getDate(),
      month: v.getMonth() + 1,
      year: v.getFullYear(),
    };
  }
  const raw = asTrimmedString(v);
  if (!raw) return null;

  const token = raw.split(/\s+/)[0] ?? '';
  const iso = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(token);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return { day, month, year };
    }
    return null;
  }

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(token);
  if (!dmy) return null;
  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  const yearRaw = Number(dmy[3]);
  const year = dmy[3].length === 2 ? 2000 + yearRaw : yearRaw;
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  ) {
    return { day, month, year };
  }
  return null;
}

function timePartsFromUnknown(
  v: unknown,
): { hour: number; minute: number } | null {
  const raw = asTrimmedString(v).replace(/\./g, ':');
  if (!raw) return null;
  const m = /(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*(am|pm)?/i.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const ampm = (m[3] ?? '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatDateDdMmYyyy(parts: {
  day: number;
  month: number;
  year: number;
}): string {
  return `${String(parts.day).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`;
}

function formatTime24(parts: { hour: number; minute: number }): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function normalizeText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function normalizeInteger(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  const raw = asTrimmedString(v).replace(/,/g, '');
  if (!raw) return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeFlag(v: unknown): 'Y' | 'N' | '' {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  const raw = asTrimmedString(v).toUpperCase();
  if (!raw) return '';
  if (['Y', 'YES', 'TRUE', '1'].includes(raw)) return 'Y';
  if (['N', 'NO', 'FALSE', '0'].includes(raw)) return 'N';
  return raw === 'Y' || raw === 'N' ? raw : '';
}

function normalizeDate(v: unknown): string {
  const d = datePartsFromUnknown(v);
  return d ? formatDateDdMmYyyy(d) : '';
}

function normalizeTime(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return formatTime24({ hour: v.getHours(), minute: v.getMinutes() });
  }
  // Excel time-only day fraction (same convention as maa-excel normalizeCell).
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1) {
    const totalMinutes = Math.round(v * 24 * 60) % (24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return formatTime24({ hour, minute });
  }
  const raw = asTrimmedString(v);
  if (!raw) return '';
  // Combined "dd/mm/yyyy HH:mm" (or ISO) — extract clock part (IPOS often lands here).
  const timeSource = timePartsAfterDateToken(raw);
  const t =
    timePartsFromUnknown(timeSource) ??
    (timeSource !== raw ? timePartsFromUnknown(raw) : null);
  if (t) return formatTime24(t);
  // Keep unrecognized non-empty values so imports/forms are not wiped blank.
  return raw;
}

function timePartsAfterDateToken(raw: string): string {
  const trimmed = asTrimmedString(raw);
  const tail = trimmed.match(
    /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+)$/,
  );
  if (tail?.[2]) return tail[2].trim();
  return trimmed;
}

function normalizeDateTime(v: unknown): string {
  if (v == null) return '';
  const raw = asTrimmedString(v);
  if (!raw) return '';
  const d = datePartsFromUnknown(raw);
  const timeSource = timePartsAfterDateToken(raw);
  const t =
    timePartsFromUnknown(timeSource) ??
    (timeSource !== raw ? timePartsFromUnknown(raw) : null);
  if (d && t) return `${formatDateDdMmYyyy(d)} ${formatTime24(t)}`;
  if (d) return formatDateDdMmYyyy(d);
  if (t) return formatTime24(t);
  // Keep original when format is unrecognized so hold/open values are not wiped.
  return raw;
}

function normalizeDuration(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const totalMin = Math.max(0, Math.trunc(v));
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const raw = asTrimmedString(v).toLowerCase();
  if (!raw) return '';

  const hhmm = /^(\d{1,3})\s*:\s*(\d{1,2})$/.exec(raw);
  if (hhmm) {
    const hh = Number(hhmm[1]);
    const mm = Number(hhmm[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && mm >= 0 && mm < 60) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  const hrMin = /^(\d+)\s*hrs?(?:\s*(\d+)\s*min)?$/.exec(raw);
  if (hrMin) {
    const hh = Number(hrMin[1] ?? 0);
    const mm = Number(hrMin[2] ?? 0);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  const minOnly = /^(\d+)\s*min$/.exec(raw);
  if (minOnly) {
    const totalMin = Number(minOnly[1]);
    if (Number.isFinite(totalMin)) {
      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return '';
}

export function normalizeFhrFlightReportByLogicalSchema<
  T extends Record<string, unknown>,
>(payload: T): T {
  const next: Record<string, unknown> = { ...payload };

  for (const [key, logicalType] of Object.entries(
    FHR_COLLECTION_FLIGHT_REPORT_LOGICAL_SCHEMA,
  )) {
    if (!(key in next)) continue;
    const value = next[key];
    switch (logicalType) {
      case 'TEXT':
        next[key] = normalizeText(value);
        break;
      case 'INTEGER':
        next[key] = normalizeInteger(value);
        break;
      case 'FLAG':
        next[key] = normalizeFlag(value);
        break;
      case 'DATE_DD_MM_YYYY':
        next[key] = normalizeDate(value);
        break;
      case 'TIME_24_HOURS':
        next[key] = normalizeTime(value);
        break;
      case 'DATE_TIME_DD_MM_YYYY_TIME_24_HOURS':
        next[key] = normalizeDateTime(value);
        break;
      case 'DURATION_HH_MM':
        next[key] = normalizeDuration(value);
        break;
      default:
        next[key] = value;
        break;
    }
  }

  return next as T;
}
