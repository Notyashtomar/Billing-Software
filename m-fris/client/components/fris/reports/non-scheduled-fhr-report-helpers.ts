import {
  fetchNonScheduledAirlineFlights,
} from '@/lib/api';
import {
  type FieldErrors,
  validateYmdDateRange,
} from '@/lib/form-validation';
import {
  processFlightData,
  type FlightData,
} from '@/utils/dataProcessor';

export type NonScheduledReportType = 'flight-report' | 'equipment-report' | 'team-report';

export type NonScheduledFilterOption = 'date-between' | 'serial-between';

export type NonScheduledFhrReportRow = {
  flight: FlightData;
  serial: string;
};

export const REPORT_TYPE_OPTIONS: { value: NonScheduledReportType; label: string }[] = [
  { value: 'flight-report', label: 'FHR Report' },
  { value: 'equipment-report', label: 'GSE Report' },
  { value: 'team-report', label: 'Team Report' },
];

export const FILTER_OPTION_OPTIONS: { value: NonScheduledFilterOption; label: string }[] = [
  { value: 'date-between', label: 'Date Between' },
  { value: 'serial-between', label: 'Serial No Between' },
];

export function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

export function firstDayOfMonthYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Inclusive lookback so seeded NS STA ranges appear without manual widen. */
export function daysAgoYmd(days: number, d = new Date()): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dt.setDate(dt.getDate() - Math.max(0, days));
  return localCalendarYmd(dt);
}

function flightReferenceDateYmd(flight: FlightData): string {
  // Prefer STA for NS schedule reports (ATA may be empty on seed).
  const raw = (flight.staDate || flight.ataDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const [a, b, y] = parts;
    const day = Number(a);
    const month = Number(b);
    if (!Number.isNaN(day) && !Number.isNaN(month)) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function parseSerialToken(value: string): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function looksNonScheduledText(raw: string): boolean {
  const ft = String(raw ?? '').toLowerCase();
  return (
    ft.includes('non-scheduled') ||
    ft.includes('non scheduled') ||
    ft.includes('nonschedule')
  );
}

export function isNonScheduledFlight(flight: FlightData): boolean {
  return (
    looksNonScheduledText(String(flight.flightType ?? '')) ||
    looksNonScheduledText(String(flight.typeOfHandling ?? ''))
  );
}

export function filterNonScheduledReportRows(
  flights: FlightData[],
  opts: {
    filterOption: NonScheduledFilterOption;
    fromDate: string;
    tillDate: string;
    serialFrom: string;
    serialTill: string;
  },
): FlightData[] {
  const serialFromN = parseSerialToken(opts.serialFrom);
  const serialTillN = parseSerialToken(opts.serialTill);

  return flights.filter((flight) => {
    if (!isNonScheduledFlight(flight)) return false;
    if (flight.isCancelled) return false;

    const serialN = parseSerialToken(String(flight.slNo ?? ''));
    if (serialN == null) return false;

    if (opts.filterOption === 'serial-between') {
      if (serialFromN != null && serialN < serialFromN) return false;
      if (serialTillN != null && serialN > serialTillN) return false;
    }

    const refYmd = flightReferenceDateYmd(flight);
    if (opts.filterOption === 'date-between') {
      if (!opts.fromDate || !opts.tillDate) return false;
      if (!refYmd || refYmd < opts.fromDate || refYmd > opts.tillDate) return false;
    } else if (opts.fromDate && opts.tillDate && refYmd) {
      if (refYmd < opts.fromDate || refYmd > opts.tillDate) return false;
    }

    if (opts.filterOption === 'date-between') {
      if (serialFromN != null && serialN < serialFromN) return false;
      if (serialTillN != null && serialN > serialTillN) return false;
    }

    return true;
  });
}

/** Rows from `ns_fhr_collection` via Non-Scheduled Airlines list API. */
export async function fetchNsFhrCollectionFlights(opts: {
  fromDate?: string;
  tillDate?: string;
  serialNo?: string;
}): Promise<unknown[]> {
  return fetchNonScheduledAirlineFlights({
    filterBy: opts.serialNo?.trim() ? 'SerialNo' : 'AirlineDate',
    serialNo: opts.serialNo,
    fromDate: opts.fromDate,
    tillDate: opts.tillDate,
  });
}

export async function loadNonScheduledFhrReportRows(opts: {
  filterOption: NonScheduledFilterOption;
  fromDate: string;
  tillDate: string;
  serialFrom: string;
  serialTill: string;
}): Promise<NonScheduledFhrReportRow[]> {
  const useDateRange =
    opts.filterOption === 'date-between' && opts.fromDate && opts.tillDate;

  // Seeded + form-saved NS FHR live in ns_fhr_collection — not main_details.
  const raw = await fetchNsFhrCollectionFlights({
    fromDate: useDateRange ? opts.fromDate : undefined,
    tillDate: useDateRange ? opts.tillDate : undefined,
  });

  const flights = processFlightData(raw);
  const filtered = filterNonScheduledReportRows(flights, opts);

  return filtered
    .map((flight) => ({
      flight,
      serial: String(flight.slNo ?? '').trim(),
    }))
    .filter((row) => row.serial)
    .sort((a, b) => Number(b.serial) - Number(a.serial));
}

export function validateNonScheduledFhrFilters(opts: {
  filterOption: NonScheduledFilterOption;
  fromDate: string;
  tillDate: string;
  serialFrom: string;
  serialTill: string;
}): FieldErrors {
  if (opts.filterOption === 'date-between') {
    return validateYmdDateRange(opts.fromDate, opts.tillDate, {
      fromKey: 'fromDate',
      toKey: 'tillDate',
      fromLabel: 'From date',
      toLabel: 'Till date',
      toNotAfterToday: true,
    });
  }

  const errors: FieldErrors = {};

  if (opts.filterOption === 'serial-between') {
    const fromN = parseSerialToken(opts.serialFrom);
    const tillN = parseSerialToken(opts.serialTill);
    if (fromN == null) errors.serialFrom = 'Enter serial number from.';
    if (tillN == null) errors.serialTill = 'Enter serial number till.';
    if (fromN != null && tillN != null && fromN > tillN) {
      errors.serialTill = 'Serial No from must be less than or equal to Till.';
    }
    return errors;
  }

  if (opts.serialFrom && opts.serialTill) {
    const fromN = parseSerialToken(opts.serialFrom);
    const tillN = parseSerialToken(opts.serialTill);
    if (fromN != null && tillN != null && fromN > tillN) {
      errors.serialTill = 'Serial No from must be less than or equal to Till.';
    }
  }

  return errors;
}
