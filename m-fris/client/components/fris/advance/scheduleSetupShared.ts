/** Shared Advance → Schedule Setup helpers, types, and UI tokens. */

import { useEffect, useState } from 'react';
import { advanceDocId } from '@/lib/api';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const HANDLING_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Ferry In/Load Out',
  'Load In/Ferry Out',
  'Load In/Terminate',
  'Ferry In/Terminate',
  'Ferry Out Only',
  'Load Out Only',
  'Ramp Handling Only',
  'Diverted Flight',
  'Return to Ramp Flight',
] as const;

export const FIELD_ORDER = [
  'airline',
  'flightNo',
  'sta',
  'std',
  'routing',
  'aircraft',
  'validFrom',
  'validTo',
  'arrivalFlightNo',
  'departureFlightNo',
  'days',
] as const;

export type ScheduleField = (typeof FIELD_ORDER)[number];

export const CSV_MAX_BYTES = 5 * 1024 * 1024;

/** One year from 09/09/2026 — stretch Schedule Setup Valid To without new FHR days. */
export const SCHEDULE_ONE_YEAR_VALID_TO = '09/09/2027';

export const SCHEDULE_LABEL =
  'mb-1.5 block text-sm font-medium leading-snug text-gray-700';

export const SCHEDULE_CONTROL =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export const SCHEDULE_CONTROL_INVALID =
  'box-border h-10 w-full rounded-lg border border-red-500 bg-white px-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export const DATE_PICKER_INVALID_CLASS =
  '[&_button]:!border-red-500 [&_button]:!ring-2 [&_button]:!ring-red-200';

export const SCHEDULE_BTN_TRANSITION =
  'transition-[transform,opacity] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]';

export const SCHEDULE_PRIMARY_BTN = `inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-600 disabled:opacity-60 ${SCHEDULE_BTN_TRANSITION}`;

export const SCHEDULE_SECONDARY_BTN = `inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 ${SCHEDULE_BTN_TRANSITION}`;

export const SCHEDULE_AMBER_BTN = `inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60 ${SCHEDULE_BTN_TRANSITION}`;

export function scheduleControlClass(invalid?: boolean): string {
  return invalid ? SCHEDULE_CONTROL_INVALID : SCHEDULE_CONTROL;
}

export type ScheduleFormValues = ReturnType<typeof createEmptyScheduleForm>;

export type AdvanceAirlineOption = {
  id: string;
  name: string;
  code: string;
};

export type AdvanceAircraftMasterOption = {
  type: string;
  body: 'NB' | 'WB';
};

export type AdvanceScheduleSetupMasterRow = {
  id: string;
  data: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
  serialNo?: string;
};

export function createEmptyScheduleDays(): Record<string, boolean> {
  return Object.fromEntries(DAYS.map((day) => [day, false]));
}

export function createEmptyScheduleForm() {
  return {
    flightType: '',
    flightNo: '',
    sta: '',
    std: '',
    nextDay: 'false',
    routing: '',
    aircraft: '',
    aircraftBody: 'NB',
    freighter: 'No',
    typeOfHandling: 'Turnaround',
    validFrom: '',
    validTo: '',
    operationSplit: false,
    arrivalFlightNo: '',
    departureFlightNo: '',
    days: createEmptyScheduleDays(),
    active: true,
  };
}

/** Valid To must fall on or after Valid From. */
export function validityOrderError(validFrom: string, validTo: string): string | null {
  const from = ddMmYyyyToYmd(validFrom);
  const to = ddMmYyyyToYmd(validTo);
  if (!from || !to) return null;
  if (from > to) return 'Valid To must be on or after Valid From.';
  return null;
}

export function ddMmYyyyToLocalDate(value: string): Date | undefined {
  const ymd = ddMmYyyyToYmd(value);
  if (!ymd) return undefined;
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function ddMmYyyyToYmd(ddMmYyyy: string): string | null {
  const norm = String(ddMmYyyy ?? '').trim();
  if (!norm) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = norm.split(/[/-]/).map((p) => p.trim());
  if (parts.length !== 3 || parts[2]?.length !== 4) return null;
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  const y = Number(parts[2]);
  if (!d || !m || !y) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function normalizeScheduleDays(days: unknown): Record<string, boolean> {
  const out = createEmptyScheduleDays();
  const source =
    days && typeof days === 'object' && !Array.isArray(days)
      ? (days as Record<string, unknown>)
      : {};
  for (const day of DAYS) {
    out[day] = parseBoolLike(source[day]);
  }
  return out;
}

export function parseBoolLike(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

export function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? ''),
    code: String(d.code ?? ''),
  };
}

export function toFormFromScheduleData(data: Record<string, unknown>) {
  const str = (...keys: string[]) => {
    for (const k of keys) {
      const v = String(data?.[k] ?? '').trim();
      if (v) return v;
    }
    return '';
  };

  const rawDays = data?.scheduleDays;
  const days = createEmptyScheduleDays();
  if (rawDays && typeof rawDays === 'object' && !Array.isArray(rawDays)) {
    for (const day of DAYS) {
      days[day] = parseBoolLike((rawDays as Record<string, unknown>)[day]);
    }
  }

  return {
    flightType: str('flightType', 'Flight Type', 'Type of flight', 'flight'),
    flightNo: str('flightNo', 'Flight No'),
    sta: str('staTime', 'STA Time'),
    std: str('stdTime', 'STD Time'),
    nextDay: parseBoolLike(data?.nextDay ?? data?.['Next Day']) ? 'true' : 'false',
    routing: str('routing', 'Routing', 'route'),
    aircraft: str('aircraft', 'Aircraft', 'TypeCraft'),
    aircraftBody: str('aircraftBody', 'Aircraft Body') || 'NB',
    freighter: str('freighter', 'Freighter') || 'No',
    typeOfHandling: str('typeOfHandling', 'Type of Handling') || 'Turnaround',
    validFrom: str('validFrom', 'Valid From', 'STA Date', 'staDate'),
    validTo: str('validTo', 'Valid To', 'STD Date', 'stdDate'),
    operationSplit: parseBoolLike(data?.ifOperationSplit ?? data?.['Operation Split']),
    arrivalFlightNo: str('arrivalFlightNo', 'Arrival Flight No'),
    departureFlightNo: str('departureFlightNo', 'Departure Flight No'),
    days,
    active: parseBoolLike(data?.active ?? data?.Active),
  };
}

export function buildAircraftMasterOptions(
  list: Record<string, unknown>[],
): AdvanceAircraftMasterOption[] {
  const seen = new Set<string>();
  const out: AdvanceAircraftMasterOption[] = [];
  for (const doc of list) {
    const d = advanceDocId(doc);
    const t = String(d.aircraft ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const body = d.aircraftBody === 'WB' ? 'WB' : 'NB';
    out.push({ type: t, body });
  }
  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

export function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

export function getBoolText(v: unknown): 'Yes' | 'No' {
  if (v === true) return 'Yes';
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
  return 'No';
}

/** Clock minutes for H:mm, HH:mm, or HH:mm:ss. */
export function scheduleClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

/** Same-day turnaround: arrival must be earlier than departure unless Next Day is on. */
export function sameDayStaNotBeforeStd(
  sta: string,
  std: string,
  nextDay: boolean,
): string | null {
  if (nextDay) return null;
  const staMinutes = scheduleClockMinutes(sta);
  const stdMinutes = scheduleClockMinutes(std);
  if (staMinutes == null || stdMinutes == null) return null;
  if (staMinutes >= stdMinutes) {
    return 'STA time must be earlier than STD time unless Next Day is on.';
  }
  return null;
}

export function getDaysList(obj: Record<string, unknown>): string[] {
  const days = obj?.scheduleDays;
  if (!days || typeof days !== 'object' || Array.isArray(days)) return [];
  return DAYS.filter((d) => {
    const v = (days as Record<string, unknown>)[d];
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    return v === true || s === 'true' || s === 'yes' || s === '1';
  });
}

export function getDaysText(obj: Record<string, unknown>): string {
  return getDaysList(obj).join(', ');
}

export function applyDayPreset(
  preset: 'daily' | 'weekdays' | 'weekends' | 'clear',
): Record<string, boolean> {
  const days = createEmptyScheduleDays();
  if (preset === 'clear') return days;
  if (preset === 'daily') {
    for (const day of DAYS) days[day] = true;
    return days;
  }
  if (preset === 'weekdays') {
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const) days[day] = true;
    return days;
  }
  days.Sat = true;
  days.Sun = true;
  return days;
}

export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
