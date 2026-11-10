/**
 * Flight snapshot readers and clock arithmetic shared by the concession /
 * conditional-charge rules. Pure functions over the preparation snapshot;
 * no contract or pricing knowledge lives here.
 */

export type InvoiceLineConcessionInput = {
  lineAmountExclTax?: number;
  quantity?: number;
  unitPrice?: number;
  serviceCode?: string;
  description?: string;
  sourceType?: string;
  preparationRecordIds?: unknown[];
  sourceRef?: Record<string, unknown>;
};

export function calendarYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!dmy) return '';
  return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

export function clockHm(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = text.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return `${iso[1].padStart(2, '0')}:${iso[2]}:${iso[3] ?? '00'}`;
  }
  const hm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!hm) return '';
  const hours = Number(hm[1]);
  const minutes = Number(hm[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${hm[2]}:${hm[3] ?? '00'}`;
}

export function parseLocalDateTime(dateYmd: string, timeText: string): Date | null {
  const ymd = calendarYmd(dateYmd);
  const time = clockHm(timeText);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !time) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || [year, month, day].some((n) => !Number.isFinite(n))) return null;
  return new Date(year, month - 1, day, Number(match[1]), Number(match[2]), Number(match[3]));
}

export function pickFlightText(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const fromSnap = snap[key];
    if (fromSnap != null && String(fromSnap).trim()) return String(fromSnap).trim();
    const fromRef = ref[key];
    if (fromRef != null && String(fromRef).trim()) return String(fromRef).trim();
  }
  return '';
}

const FHR_REMARK_KEY = /remark/i;
const FHR_SKIP_KEY =
  /^(sta|std|ata|atd|date|time|serial|regn|route|flightno|customer|airline|mtow|terminal|entry)/i;

/** Handling phrases anywhere in the FHR snapshot. Remarks stay out so a note cannot reprice the flight. */
export function collectFhrHandlingText(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
): string {
  const parts: string[] = [];
  const visit = (value: unknown, key: string | null, depth: number) => {
    if (depth > 5 || parts.length > 60) return;
    if (key && (FHR_REMARK_KEY.test(key) || FHR_SKIP_KEY.test(key))) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text && text.length <= 180) parts.push(text);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 30)) visit(item, key, depth + 1);
      return;
    }
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, childKey, depth + 1);
    }
  };
  visit(snap, null, 0);
  visit(ref, null, 0);
  return parts.join(' ');
}

export type FlightSnapshotBlob = {
  ref: Record<string, unknown>;
  snap: Record<string, unknown>;
  handlingRaw: string;
  categoryRaw: string;
  allText: string;
  handlingCorpus: string;
};

export function flightSnapshotBlob(line: InvoiceLineConcessionInput): FlightSnapshotBlob {
  const ref = line.sourceRef ?? {};
  const snap = (ref.operationalSnapshot as Record<string, unknown> | undefined) ?? ref;
  const handlingParts = [
    'typeOfHandling',
    'TypeofHandling',
    'typeofHandling',
    'flightType',
    'ops',
    'opsType',
    'typeOfFlight',
    'Typeofflight',
  ].map((key) => pickFlightText(snap, ref, [key]));
  const handlingCorpus = collectFhrHandlingText(snap, ref).toLowerCase();
  // Prefer primary Type of Handling for non-divert labels, but keep all parts for scenario detection.
  const handlingRaw = (handlingParts.find(Boolean) || handlingCorpus || '').toLowerCase();
  const categoryRaw = pickFlightText(snap, ref, [
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
    'turnaroundStatus',
  ]);
  const remarks = pickFlightText(snap, ref, ['remarks', 'Remarks']);
  // FHR often stores "Diverted Flight" on ops/typeOfFlight while typeOfHandling stays Additional/Turnaround.
  const allText = [
    ...handlingParts,
    handlingCorpus,
    categoryRaw,
    remarks,
    String(snap.sourceType ?? ref.sourceType ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return { ref, snap, handlingRaw, categoryRaw, allText, handlingCorpus };
}

export function clockMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function pickFlightRaw(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    const fromSnap = snap[key];
    if (fromSnap != null && String(fromSnap).trim() !== '') return fromSnap;
    const fromRef = ref[key];
    if (fromRef != null && String(fromRef).trim() !== '') return fromRef;
  }
  return null;
}

const ATA_DATE_KEYS = ['ataDate', 'ATADate', 'ATA Date', 'actualArrivalDate'];
const ATA_TIME_KEYS = [
  'ataTime',
  'ATATime',
  'ATA Time',
  'actualArrivalTime',
  'actualTimeOfArrival',
];
const ATD_DATE_KEYS = ['atdDate', 'ATDDate', 'ATD Date', 'actualDepartureDate'];
const ATD_TIME_KEYS = [
  'atdTime',
  'ATDTime',
  'ATD Time',
  'actualDepartureTime',
  'actualTimeOfDeparture',
];
const FLIGHT_DATE_KEYS = [
  'staDate',
  'STADate',
  'STA Date',
  'stdDate',
  'STDDate',
  'STD Date',
  'flightDate',
  'billingDateYmd',
];

function movementInstant(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
  fallbackDateKeys: string[] = [],
): Date | null {
  const dateRaw = pickFlightRaw(snap, ref, dateKeys);
  const timeRaw = pickFlightRaw(snap, ref, timeKeys);
  let ymd = calendarYmd(dateRaw);
  let hm = clockHm(timeRaw);
  if (!ymd && timeRaw != null) ymd = calendarYmd(timeRaw);
  if (!hm && dateRaw != null) hm = clockHm(dateRaw);
  if (!ymd && fallbackDateKeys.length > 0) {
    ymd = calendarYmd(pickFlightRaw(snap, ref, fallbackDateKeys));
  }
  if (!ymd || !hm) return null;
  return parseLocalDateTime(ymd, hm);
}

export function snapshotDateTime(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
): Date | null {
  return movementInstant(snap, ref, dateKeys, timeKeys);
}

/**
 * Ground time is actual departure minus actual arrival.
 * Overnight turns (departure clock before arrival) roll into the next day.
 */
export function actualGroundMinutes(line: InvoiceLineConcessionInput): number | null {
  const { snap, ref } = flightSnapshotBlob(line);
  const ata = movementInstant(snap, ref, ATA_DATE_KEYS, ATA_TIME_KEYS, FLIGHT_DATE_KEYS);
  const atd = movementInstant(snap, ref, ATD_DATE_KEYS, ATD_TIME_KEYS, [
    'stdDate',
    'STDDate',
    'STD Date',
    ...FLIGHT_DATE_KEYS,
  ]);
  if (!ata || !atd) return null;
  let end = atd.getTime();
  if (end < ata.getTime()) end += 24 * 60 * 60 * 1000;
  const minutes = (end - ata.getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

export function durationMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length >= 2 && parts.every((part) => /^\d+(\.\d+)?$/.test(part))) {
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 60 + minutes + (seconds ?? 0) / 60;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Minutes the actual movement ran past the scheduled one.
 * Early movements are 0 (not late). Only a real midnight crossing — actual clock
 * more than 12 h "before" schedule because the date did not roll — adds a day;
 * otherwise an ATA of 22:57 against an STA of 23:15 would read as 23 h 42 m late.
 */
const HALF_DAY_MINUTES = 12 * 60;

function minutesPastSchedule(scheduled: Date, actual: Date): number | null {
  const dayMs = 24 * 60 * 60 * 1000;
  let diff = actual.getTime() - scheduled.getTime();
  if (diff < -dayMs / 2) diff += dayMs;
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, diff / 60000);
}

/**
 * Minutes late, reconciling the clock arithmetic with the delay the FHR recorded.
 *
 * A gap of more than 12 h on the same calendar date is ambiguous: an ATA of
 * 23:50 against an STA of 00:30 is far more often an arrival the previous
 * evening whose date was not rolled back than a 23-hour delay. In that case
 * the recorded delay field decides; without one the flight is treated as
 * early (0) rather than billed as a day late.
 */
function reconciledLateMinutes(
  scheduled: Date | null,
  actual: Date | null,
  recordedDelay: number | null,
): number | null {
  if (scheduled && actual) {
    const minutes = minutesPastSchedule(scheduled, actual);
    if (minutes != null) {
      if (minutes <= HALF_DAY_MINUTES) return minutes;
      return recordedDelay != null ? Math.max(0, recordedDelay) : 0;
    }
  }
  return recordedDelay;
}

export function lateArrivalMinutes(line: InvoiceLineConcessionInput): number | null {
  const { snap, ref } = flightSnapshotBlob(line);
  const sta = snapshotDateTime(
    snap,
    ref,
    ['staDate', 'STADate'],
    ['staTime', 'STATime'],
  );
  const ata = snapshotDateTime(
    snap,
    ref,
    ['ataDate', 'ATADate'],
    ['ataTime', 'ATATime'],
  );
  const recorded = durationMinutes(snap.delayOnSta ?? snap.arrivalDelay ?? snap.ActualDelay);
  return reconciledLateMinutes(sta, ata, recorded);
}

/** ATD later than STD, in minutes. */
export function lateDepartureMinutes(line: InvoiceLineConcessionInput): number | null {
  const { snap, ref } = flightSnapshotBlob(line);
  const std = snapshotDateTime(
    snap,
    ref,
    ['stdDate', 'STDDate'],
    ['stdTime', 'STDTime'],
  );
  const atd = snapshotDateTime(
    snap,
    ref,
    ['atdDate', 'ATDDate'],
    ['atdTime', 'ATDTime'],
  );
  const recorded = durationMinutes(snap.delayOnStd ?? snap.departureDelay);
  return reconciledLateMinutes(std, atd, recorded);
}

export function hasActualClock(
  line: InvoiceLineConcessionInput,
  timeKeys: string[],
): boolean {
  const { snap, ref } = flightSnapshotBlob(line);
  return timeKeys.some((key) => {
    const raw = snap[key] ?? ref[key];
    if (raw == null) return false;
    const text = String(raw).trim().toLowerCase();
    return Boolean(text) && text !== '-' && text !== 'null' && text !== 'n/a';
  });
}
