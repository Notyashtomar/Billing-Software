import {
  AIRLINE_REMARKS_BLANK_LABEL,
  AIRLINE_REMARKS_RATING_VALUES,
  isAirlineRemarksRating,
} from 'src/remarks/remarks-rating.constants';
import {
  excelTimeToHm,
  mapFhrDocToStationWiseRow,
  normalizeStationWiseAirlineName,
  parseToYmd,
} from './station-wise-map-fhr.util';
import { MONTH_ABBR, monthSheetName } from './station-wise-months.util';

/** Excel RateingValue labels (header row N3–R3) — "Not satisfactory" spelling. */
export const REMARKS_EXCEL_RATING_LABELS = [
  'Not satisfactory',
  'Below Average',
  'Satisfactory',
  'Good',
  'Excellent',
] as const;

export type RemarksExcelRatingLabel =
  (typeof REMARKS_EXCEL_RATING_LABELS)[number];

export type RemarksFlightRow = {
  serialNo: number | string;
  airline: string;
  airlineCode: string;
  flightNo: string;
  typeCraft: string;
  ataTime: string;
  ataDate: string;
  /** Airline representative name (`remarks.airrep` / Main Details). */
  airRep: string;
  /** Airline representative remarks (`remarks.AirRepRem`). */
  airRepRem: string;
  /** Excel RateingValue (template spelling). */
  ratingValue: RemarksExcelRatingLabel | '';
  staYmd: string;
};

export type RemarksPreviewFlight = {
  serialNo: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  ataTime: string;
  ataDate: string;
  airRep: string;
  airRepRem: string;
  ratingValue: string;
  staYmd: string;
};

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function isCancelledDoc(doc: Record<string, unknown>): boolean {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  if (m.flightCancelled === true || doc.isCancelled === true) return true;
  const status = firstString(m.departureStatus, m.DepartureStatus, doc.departureStatus);
  const lower = status.toLowerCase();
  return lower === 'cancelled' || lower === 'xxld';
}

/** Map Mongo `airlineRemarksRating` → Excel RateingValue label. */
export function toExcelRatingValue(raw: string): RemarksExcelRatingLabel | '' {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'not satisfactory' || lower === 'not-satisfactory') {
    return 'Not satisfactory';
  }
  for (const label of REMARKS_EXCEL_RATING_LABELS) {
    if (label.toLowerCase() === lower) return label;
  }
  if (isAirlineRemarksRating(s)) {
    if (s === 'Not Satisfactory') return 'Not satisfactory';
    return s as RemarksExcelRatingLabel;
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickExactKeys(
  obj: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string {
  if (!obj) return '';
  for (const key of keys) {
    if (!(key in obj) && obj[key] == null) continue;
    const s = String(obj[key] ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** FHR key `airrep` only — never read `AirRepRem`. */
const AIRREP_KEYS = ['airrep', 'AirRep', 'airRep'] as const;

/** FHR key `AirRepRem` only — never read `airrep`. */
const AIRREPREM_KEYS = ['AirRepRem'] as const;

/**
 * Airline representative name from `fhr_collection.remarks.airrep`
 * (also `mainDetails.airrep` / top-level `airrep` — same key).
 */
export function airRepFromDoc(
  rem: Record<string, unknown> | null,
  doc: Record<string, unknown>,
): string {
  return (
    pickExactKeys(rem, AIRREP_KEYS) ||
    pickExactKeys(asRecord(doc.mainDetails), AIRREP_KEYS) ||
    pickExactKeys(doc, AIRREP_KEYS)
  );
}

/**
 * Airline representative remarks from `fhr_collection.remarks.AirRepRem`
 * (or top-level `AirRepRem`). Never mixed with `airrep`.
 */
export function airRepRemFromDoc(
  rem: Record<string, unknown> | null,
  doc: Record<string, unknown>,
): string {
  return pickExactKeys(rem, AIRREPREM_KEYS) || pickExactKeys(doc, AIRREPREM_KEYS);
}

/**
 * MIS Remarks month tab: MARCH26 (template) vs MAR26 (Station Wise).
 */
export function remarksMonthSheetName(year: number, monthIndex0: number): string {
  if (monthIndex0 === 2) return `MARCH${String(year).slice(-2)}`;
  const abbr = MONTH_ABBR[monthIndex0] ?? 'UNK';
  return `${abbr}${String(year).slice(-2)}`;
}

export function remarksSheetNameForYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(ymd ?? '').trim());
  if (!m) return monthSheetName(2026, 0);
  return remarksMonthSheetName(Number(m[1]), Number(m[2]) - 1);
}

export function mapFhrDocToRemarksRow(
  doc: Record<string, unknown>,
): RemarksFlightRow | null {
  if (isCancelledDoc(doc)) return null;

  const base = mapFhrDocToStationWiseRow(doc);
  if (!base) return null;

  const rem =
    doc.remarks && typeof doc.remarks === 'object' && !Array.isArray(doc.remarks)
      ? (doc.remarks as Record<string, unknown>)
      : null;

  const ratingRaw = firstString(
    rem?.airlineRemarksRating,
    rem?.AirlineRemarksRating,
    rem?.RateingValue,
    rem?.ratingValue,
  );

  const airline = normalizeStationWiseAirlineName(base.airline, base.flightNo);

  return {
    serialNo: base.serialNo,
    airline,
    airlineCode: base.airlineCode,
    flightNo: base.flightNo,
    typeCraft: base.typeCraft,
    ataTime: excelTimeToHm(base.ataTime),
    ataDate: base.ataDate,
    airRep: airRepFromDoc(rem, doc),
    airRepRem: airRepRemFromDoc(rem, doc),
    ratingValue: toExcelRatingValue(ratingRaw),
    staYmd: base.staYmd,
  };
}

export function toRemarksPreviewFlight(row: RemarksFlightRow): RemarksPreviewFlight {
  return {
    serialNo: String(row.serialNo || ''),
    airline: row.airline,
    flightNo: row.flightNo,
    typeCraft: row.typeCraft,
    ataTime: row.ataTime,
    ataDate: row.ataDate,
    airRep: row.airRep,
    airRepRem: row.airRepRem,
    ratingValue: row.ratingValue,
    staYmd: row.staYmd,
  };
}

export function ratingBucketKey(
  rating: RemarksExcelRatingLabel | '',
): RemarksExcelRatingLabel | typeof AIRLINE_REMARKS_BLANK_LABEL {
  return rating || AIRLINE_REMARKS_BLANK_LABEL;
}

/** Sanity: Mongo enum still covers Excel labels after normalize. */
export function mongoRatingsCoverExcel(): boolean {
  return AIRLINE_REMARKS_RATING_VALUES.length === REMARKS_EXCEL_RATING_LABELS.length;
}

export function parseRemarksStaYmdFallback(doc: Record<string, unknown>): string | null {
  const rem =
    doc.remarks && typeof doc.remarks === 'object' && !Array.isArray(doc.remarks)
      ? (doc.remarks as Record<string, unknown>)
      : null;
  return (
    parseToYmd(rem?.flightStaDateIso) ||
    parseToYmd(rem?.STADate) ||
    parseToYmd(rem?.staDate)
  );
}
