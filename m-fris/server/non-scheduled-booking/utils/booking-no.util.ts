/** Mongo collection — `NS` prefix on the collection name. */
export const NS_NON_SCHEDULED_BOOKING_COLLECTION = 'ns-non-scheduled-booking';

/** Counter key in `flight_serial_counter` for NS document serials. */
export const NS_BOOKING_SERIAL_COUNTER_KEY = 'ns_booking_serial';

/** Dedicated atomic counter for the four-digit non-scheduled Serial/FHR identity. */
export const NS_FHR_SERIAL_COUNTER_KEY = 'ns_fhr_serial_4d';
export const NS_FHR_SERIAL_MIN = 1000;
export const NS_FHR_SERIAL_MAX = 9999;

/**
 * Legacy flight serial base retained only for parsing old `NS-100001` document
 * identifiers. New non-scheduled Serial/FHR identities use the four-digit
 * `ns_fhr_serial_4d` counter.
 */
export const NS_FLIGHT_SERIAL_BASE = 100000;

export const BOOKING_CHANNELS = ['mail', 'direct'] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

export const BOOKING_STATUSES = [
  'booking_created',
  'challan_pending',
  'challan_generated',
  'passengers_added',
  'flight_ready',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const FLIGHT_TYPE_FIXED = 'Non-Scheduled';
export const SERVICE_TYPE_FIXED = 'Comprehensive Handling (Flight)';

export type NsDocumentKind = 'BKG' | 'CLN';

export type FormatNsDocumentNoInput = {
  stationCode: string;
  kind: NsDocumentKind;
  /** Unique per-flight serial (1-based counter). */
  serial: number;
  /** Booking date — any common FRIS date form; normalized to DD-MM-YYYY in the id. */
  bookingDate: string;
  airlineCode: string;
  flightNo: string;
};

/** Compact serial segment, e.g. 1 → `000001`. */
export function formatNsSerialSegment(serial: number): string {
  const n = Math.trunc(Number(serial));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Invalid NS document serial');
  }
  return String(n).padStart(6, '0');
}

/**
 * Normalize booking date into a single path segment `DD-MM-YYYY`.
 * Accepts `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`.
 */
export function normalizeBookingDateSegment(raw: string | undefined | null): string {
  const t = String(raw ?? '').trim();
  if (!t) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${now.getFullYear()}`;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const parts = t.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const [a, b, y] = parts;
    return `${a.padStart(2, '0')}-${b.padStart(2, '0')}-${y}`;
  }

  return t.replace(/\//g, '-');
}

function sanitizeSegment(raw: string, fallback = 'NA'): string {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\//g, '-');
  return v || fallback;
}

/**
 * Business document number:
 * `{station}/{BKG|CLN}/{serial}/{DD-MM-YYYY}/{airlineCode}/{flightNo}`
 *
 * Date uses hyphens so the id always has exactly 6 `/`-separated segments.
 */
export function formatNsDocumentNo(input: FormatNsDocumentNoInput): string {
  const station = sanitizeSegment(input.stationCode, 'MAA');
  const serial = formatNsSerialSegment(input.serial);
  const date = normalizeBookingDateSegment(input.bookingDate);
  const airline = sanitizeSegment(input.airlineCode, 'XX');
  const flight = sanitizeSegment(input.flightNo, 'FLT');
  return `${station}/${input.kind}/${serial}/${date}/${airline}/${flight}`;
}

/** URL-safe key for the same identity (path params, query encoding). */
export function toNsBookingKey(bookingNo: string): string {
  return String(bookingNo ?? '')
    .trim()
    .toUpperCase()
    .replace(/\//g, '_');
}

export function fromNsBookingKey(bookingKey: string): string {
  return String(bookingKey ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, '/');
}

/** @deprecated Prefer {@link formatNsDocumentNo}. Kept for legacy NS-100001 ids. */
export function formatBookingNo(sequenceNumber: number): string {
  const seq = String(NS_FLIGHT_SERIAL_BASE + sequenceNumber).padStart(6, '0');
  return `NS-${seq}`;
}

export function normalizeBookingNo(raw: string | undefined | null): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  // Accept URL-safe keys and display forms.
  if (trimmed.includes('_') && !trimmed.includes('/')) {
    return fromNsBookingKey(trimmed);
  }
  return trimmed.toUpperCase();
}
