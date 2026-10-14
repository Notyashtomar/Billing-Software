import type { NonScheduledFlightData } from '@/components/fris/flights/non-scheduled-airlines';
import { processFlightData } from '@/utils/dataProcessor';
import {
  type FieldErrors,
  validateYmdDateRange,
} from '@/lib/form-validation';

export type NonScheduledFilterMode =
  | 'serial-no'
  | 'challan-no'
  | 'booking-no'
  | 'airline-date';

export const NON_SCHEDULED_FILTER_MODES: {
  value: NonScheduledFilterMode;
  label: string;
}[] = [
  { value: 'serial-no', label: 'Serial No' },
  { value: 'challan-no', label: 'Performa No' },
  { value: 'booking-no', label: 'Booking No' },
  { value: 'airline-date', label: 'Airline/Date' },
];

/** Prefer exact-lookup fields when filled; otherwise airline + date range. */
export function resolveNonScheduledFilterMode(opts: {
  serialNo: string;
  challanNo: string;
  bookingNo: string;
}): NonScheduledFilterMode {
  if (opts.serialNo.trim()) return 'serial-no';
  if (opts.challanNo.trim()) return 'challan-no';
  if (opts.bookingNo.trim()) return 'booking-no';
  return 'airline-date';
}

export function filterModeToApiFilterBy(
  mode: NonScheduledFilterMode,
): 'SerialNo' | 'ChallanNo' | 'BookingNo' | 'AirlineDate' {
  switch (mode) {
    case 'serial-no':
      return 'SerialNo';
    case 'challan-no':
      return 'ChallanNo';
    case 'booking-no':
      return 'BookingNo';
    case 'airline-date':
      return 'AirlineDate';
  }
}

export function scheduleLabelToYmd(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const [a, b, y] = parts;
    const day = Number(a);
    const month = Number(b);
    if (!Number.isNaN(day) && !Number.isNaN(month)) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return raw;
}

export function localCalendarYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Same as Scheduled Airlines: From + To default to the current local calendar day. */
export function defaultNonScheduledDateRange(today = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const ymd = localCalendarYmd(today);
  return { fromDate: ymd, toDate: ymd };
}

/** Inclusive lookback for date windows (e.g. Non-Scheduled FHR report). */
export function daysAgoYmd(days: number, d = new Date()): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dt.setDate(dt.getDate() - Math.max(0, days));
  return localCalendarYmd(dt);
}

export function monthStartYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function pickRaw(doc: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = doc[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** Avoid `AI123/AI123` when arrival + departure flight nos are identical. */
function normalizeNsFlightNo(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const parts = s
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    parts.length === 2 &&
    parts[0]!.toUpperCase() === parts[1]!.toUpperCase()
  ) {
    return parts[0]!;
  }
  return s;
}

export function mainDetailsToNonScheduledRow(
  raw: Record<string, unknown>,
): NonScheduledFlightData | null {
  const flights = processFlightData([raw]);
  const flight = flights[0];
  if (!flight) return null;

  const serial = Number(flight.slNo);
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const arrival = pickRaw(raw, 'ArrivalFltNo', 'arrivalFlightNo', 'Arrival Flt No');
  const departure = pickRaw(
    raw,
    'DepartureFltNo',
    'departureFlightNo',
    'Departure Flt No',
  );
  const fromParts =
    arrival && departure
      ? arrival.toUpperCase() === departure.toUpperCase()
        ? arrival
        : `${arrival}/${departure}`
      : arrival || departure;

  const opsHandling = pickRaw(raw, 'TypeofHandling', 'typeofHandling');
  const opsFlight = pickRaw(raw, 'Typeofflight', 'TypeOfFlight', 'flightType');
  // Prefer Non-Scheduled marker for table ops; Excel stores Turnaround/Ferry in Typeofflight.
  const ops =
    /non[-\s]?scheduled/i.test(opsHandling)
      ? opsHandling
      : /non[-\s]?scheduled/i.test(opsFlight)
        ? opsFlight
        : opsHandling || opsFlight || flight.typeOfHandling || flight.flightType || 'Non-Scheduled';

  return {
    sNo: serial,
    flightNo: normalizeNsFlightNo(
      fromParts || flight.flightNo || pickRaw(raw, 'flightNo', 'FlightNo', 'Flight No'),
    ),
    airline: flight.airline,
    airlineCode:
      flight.airlineCode || pickRaw(raw, 'Arline_Code', 'airlineCode', 'AirlineCode'),
    aircraft: flight.aircraft,
    routing:
      (flight.route && String(flight.route).trim()) ||
      pickRaw(raw, 'Route', 'Routing', 'routing', 'route'),
    ops,
    staDate: scheduleLabelToYmd(
      flight.staDate ||
        pickRaw(raw, 'STADate', 'staDate', 'ATADate', 'ataDate'),
    ),
    staTime:
      flight.staTime || pickRaw(raw, 'STATime', 'staTime', 'ATATime', 'ataTime'),
    stdDate: scheduleLabelToYmd(
      flight.stdDate ||
        pickRaw(raw, 'STDDate', 'stdDate', 'ATDDate', 'atdDate'),
    ),
    stdTime:
      flight.stdTime || pickRaw(raw, 'STDTime', 'stdTime', 'ATDTime', 'atdTime'),
    exportedNAV:
      flight.exportedNAV ||
      pickRaw(raw, 'exportedNAV', 'Exported NAV', 'Nav_Data_Status') ||
      'No',
    challanNo: pickRaw(raw, 'challanNo', 'ChallanNo', 'Challan No'),
    bookingNo: pickRaw(raw, 'bookingNo', 'BookingNo', 'Booking No'),
    operator: pickRaw(raw, 'operator', 'Operator'),
    dataOf: pickRaw(raw, 'FlightDataExportedDate', 'FlightDataExportedBy'),
    flightSerialNo: Number.isFinite(serial) ? serial : undefined,
    bookingKey: pickRaw(raw, 'bookingKey', 'BookingKey'),
    flightStatus: flight.flightStatus ?? 'Open',
    isCancelled: Boolean(flight.isCancelled),
    hasMainDetails: flight.hasMainDetails,
    hasTerminalDetails: flight.hasTerminalDetails,
    hasRampDetails: flight.hasRampDetails,
    hasLoadControlDetails: flight.hasLoadControlDetails,
    hasEquipmentManpowerDetails: flight.hasEquipmentManpowerDetails,
    rampLocked: flight.rampLocked,
    paxLocked: flight.paxLocked,
    gsdLocked: flight.gsdLocked,
  };
}

export function mapMainDetailsListToRows(
  rawList: unknown[],
): NonScheduledFlightData[] {
  if (!Array.isArray(rawList)) return [];
  const rows: NonScheduledFlightData[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const mapped = mainDetailsToNonScheduledRow(item as Record<string, unknown>);
    if (mapped) rows.push(mapped);
  }
  return rows.sort((a, b) => b.sNo - a.sNo);
}

export function validateNonScheduledFilterFields(opts: {
  mode?: NonScheduledFilterMode;
  serialNo: string;
  challanNo: string;
  bookingNo: string;
  airline: string;
  fromDate: string;
  toDate: string;
}): FieldErrors {
  const mode =
    opts.mode ??
    resolveNonScheduledFilterMode({
      serialNo: opts.serialNo,
      challanNo: opts.challanNo,
      bookingNo: opts.bookingNo,
    });
  switch (mode) {
    case 'serial-no':
      if (!opts.serialNo.trim()) return { serialNo: 'Enter a serial number.' };
      return {};
    case 'challan-no':
      if (!opts.challanNo.trim()) return { challanNo: 'Enter a performa number.' };
      return {};
    case 'booking-no':
      if (!opts.bookingNo.trim()) return { bookingNo: 'Enter a booking number.' };
      return {};
    case 'airline-date':
      return validateYmdDateRange(opts.fromDate, opts.toDate, {
        fromLabel: 'From date',
        toLabel: 'To date',
        toNotAfterToday: true,
        fromNotAfterToday: true,
      });
  }
}

export function validateNonScheduledFilterInput(opts: {
  mode?: NonScheduledFilterMode;
  serialNo: string;
  challanNo: string;
  bookingNo: string;
  airline: string;
  fromDate: string;
  toDate: string;
}): string | null {
  const errors = validateNonScheduledFilterFields(opts);
  const first = Object.values(errors).find((m) => typeof m === 'string' && m.length > 0);
  return first ?? null;
}
