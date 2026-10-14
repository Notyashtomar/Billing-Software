/**
 * Reusable client-side form validation for Advance Gateway (and similar) forms.
 * Keep validators pure — no React, no toast.
 */

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

/** Collapse whitespace and trim ends. */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function trimValue(value: string): string {
  return value.trim();
}

export function required(value: string, label: string): string | null {
  if (!normalizeText(value)) return `${label} is required.`;
  return null;
}

export function minLength(value: string, min: number, label: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  return null;
}

export function maxLength(value: string, max: number, label: string): string | null {
  const v = value.trim();
  if (v.length > max) return `${label} must be at most ${max} characters.`;
  return null;
}

export function exactLength(value: string, len: number, label: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (v.length !== len) return `${label} must be exactly ${len} characters.`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value: string, label = 'Email'): string | null {
  const v = trimValue(value);
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return `Please enter a valid ${label.toLowerCase()}.`;
  return null;
}

/** Digits with optional leading +, length 7–15. */
const PHONE_RE = /^\+?\d{7,15}$/;

export function phone(value: string, label = 'Phone number'): string | null {
  const v = trimValue(value).replace(/[\s()-]/g, '');
  if (!v) return null;
  if (!PHONE_RE.test(v)) return `${label} must contain 7–15 digits.`;
  return null;
}

/** Indian-style 10-digit mobile when no country code. */
export function mobile10(value: string, label = 'Mobile number'): string | null {
  const v = trimValue(value).replace(/[\s()-]/g, '');
  if (!v) return null;
  if (/^\+?\d{7,15}$/.test(v)) return null;
  if (!/^\d{10}$/.test(v)) return `${label} must contain 10 digits.`;
  return null;
}

/** Airline / IATA-style code: A–Z / 0–9, 1–5 chars. */
export function airlineCode(value: string, label = 'Airline code'): string | null {
  const v = trimValue(value).toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{1,5}$/.test(v)) {
    return `${label} must be 1 to 5 characters (A–Z, 0–9).`;
  }
  return null;
}

/** Person display name — letters and spaces only. No digits or punctuation. */
export function personName(value: string, label: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(v)) {
    return `${label} may only contain letters and spaces.`;
  }
  return null;
}

/** Employee / staff code: alphanumeric, optional hyphen/underscore. */
export function employeeId(value: string, label = 'Employee ID'): string | null {
  const v = trimValue(value).toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(v)) {
    return `${label} must be 1–20 characters (A–Z, 0–9, -, _).`;
  }
  return null;
}

export function selectRequired(value: string, label: string): string | null {
  if (!trimValue(value)) return `Select a ${label}.`;
  return null;
}

export function positiveInteger(
  value: string,
  label: string,
  opts?: { min?: number; max?: number; allowEmpty?: boolean },
): string | null {
  const v = trimValue(value);
  if (!v) return opts?.allowEmpty === false ? `${label} is required.` : null;
  if (!/^\d+$/.test(v)) return `${label} must be a whole number.`;
  const n = Number(v);
  if (opts?.min != null && n < opts.min) return `${label} must be at least ${opts.min}.`;
  if (opts?.max != null && n > opts.max) return `${label} must be at most ${opts.max}.`;
  return null;
}

export function nonNegativeNumber(
  value: string,
  label: string,
  opts?: { max?: number; allowEmpty?: boolean },
): string | null {
  const v = trimValue(value);
  if (!v) return opts?.allowEmpty === false ? `${label} is required.` : null;
  if (!/^\d+(\.\d+)?$/.test(v)) return `${label} must be a valid number.`;
  const n = Number(v);
  if (n < 0) return `${label} cannot be negative.`;
  if (opts?.max != null && n > opts.max) return `${label} must be at most ${opts.max}.`;
  return null;
}

/** ISO or HTML date input (YYYY-MM-DD). */
export function validDate(value: string, label: string): string | null {
  const v = trimValue(value);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} must be a valid date.`;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return `${label} must be a valid date.`;
  return null;
}

/** Shared invalid control / DatePicker wrap classes (Creation, Flights, Reports, Others). */
export const FRIS_INVALID_CONTROL =
  '!border-red-500 hover:!border-red-500 focus:!border-red-500 focus-visible:!border-red-500 focus:!ring-red-200/60 focus-visible:!ring-red-200/60';

export const FRIS_INVALID_PICKER_WRAP =
  '[&_button]:!border-red-500 [&_button]:hover:!border-red-500 [&_button]:focus-visible:!ring-red-200/60';

/** Today as YYYY-MM-DD in local time. */
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Validate a from/to YYYY-MM-DD range (common filter pattern across FRIS).
 * Returns field errors for `fromDate` / `toDate` (or custom keys).
 */
export function validateYmdDateRange(
  from: string,
  to: string,
  opts?: {
    fromKey?: string;
    toKey?: string;
    fromLabel?: string;
    toLabel?: string;
    required?: boolean;
    /** When true, toDate cannot be after today. */
    toNotAfterToday?: boolean;
    /** When true, fromDate cannot be after today. */
    fromNotAfterToday?: boolean;
  },
): FieldErrors {
  const fromKey = opts?.fromKey ?? 'fromDate';
  const toKey = opts?.toKey ?? 'toDate';
  const fromLabel = opts?.fromLabel ?? 'From date';
  const toLabel = opts?.toLabel ?? 'To date';
  const requireBoth = opts?.required !== false;
  const a = trimValue(from);
  const b = trimValue(to);
  const errors: FieldErrors = {};

  if (requireBoth) {
    if (!a) errors[fromKey] = `${fromLabel} is required.`;
    if (!b) errors[toKey] = `${toLabel} is required.`;
  }

  if (a) {
    const err = validDate(a, fromLabel);
    if (err) errors[fromKey] = err;
  }
  if (b) {
    const err = validDate(b, toLabel);
    if (err) errors[toKey] = err;
  }

  if (!errors[fromKey] && !errors[toKey] && a && b && a > b) {
    errors[toKey] = `${toLabel} cannot be before ${fromLabel}.`;
  }

  const today = todayYmd();
  if (!errors[fromKey] && a && opts?.fromNotAfterToday && a > today) {
    errors[fromKey] = `${fromLabel} cannot be after today.`;
  }
  if (!errors[toKey] && b && opts?.toNotAfterToday && b > today) {
    errors[toKey] = `${toLabel} cannot be after today.`;
  }

  return errors;
}

/** Display date used across Creation forms (dd/MM/yyyy). */
export function displayDate(value: string, label: string): string | null {
  const v = trimValue(value);
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return `${label} must be a valid date (dd/MM/yyyy).`;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return `${label} must be a valid date.`;
  }
  return null;
}

/** Compare two dd/MM/yyyy dates. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareDisplayDates(a: string, b: string): number | null {
  const parse = (raw: string): number | null => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimValue(raw));
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d.getTime();
  };
  const ta = parse(a);
  const tb = parse(b);
  if (ta == null || tb == null) return null;
  return ta - tb;
}

export function displayDateNotBefore(
  value: string,
  minDate: string,
  label: string,
  minLabel = 'the minimum date',
): string | null {
  if (displayDate(value, label) || displayDate(minDate, minLabel)) return null;
  const cmp = compareDisplayDates(value, minDate);
  if (cmp == null) return null;
  if (cmp < 0) return `${label} cannot be before ${minLabel}.`;
  return null;
}

export function displayDateRange(
  start: string,
  end: string,
  startLabel = 'Start date',
  endLabel = 'End date',
): string | null {
  if (!trimValue(start) || !trimValue(end)) return null;
  const startErr = displayDate(start, startLabel);
  if (startErr) return startErr;
  const endErr = displayDate(end, endLabel);
  if (endErr) return endErr;
  const cmp = compareDisplayDates(start, end);
  if (cmp != null && cmp > 0) return `${endLabel} cannot be before ${startLabel}.`;
  return null;
}

/** Aircraft body: NB or WB. */
export function aircraftBody(value: string, label = 'Aircraft body'): string | null {
  const v = trimValue(value).toUpperCase();
  if (!v) return null;
  if (v !== 'NB' && v !== 'WB') return `${label} must be NB or WB.`;
  return null;
}

/**
 * Creation flight numbers: airline code + digits, optional hyphen, or
 * turnaround pair with slash (e.g. GF-1234, IX1089/IX1685).
 */
export function creationFlightNumber(value: string, label = 'Flight number'): string | null {
  const v = normalizeText(value).toUpperCase().replace(/\s/g, '');
  if (!v) return null;
  // Single leg: ABC123 or AB-1234
  if (/^[A-Z0-9]{2,16}$/.test(v) || /^[A-Z0-9]{1,4}-[A-Z0-9]{1,12}$/.test(v)) {
    return null;
  }
  // Turnaround / dual flight: IX1089/IX1685
  if (/^[A-Z0-9-]{2,16}\/[A-Z0-9-]{2,16}$/.test(v) && v.length <= 33) {
    return null;
  }
  return `${label} must be a flight number (e.g. 6E205 or IX1089/IX1685).`;
}

/**
 * Sanitize live flight-number typing: keep A–Z, 0–9, hyphen, and slash.
 * Slash is required for turnaround pairs (e.g. IX1089/IX1685).
 */
export function sanitizeFlightNoInput(raw: string, maxLen = 33): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .slice(0, Math.max(1, maxLen));
}

/** Schedule Setup flight no: A–Z, 0–9, optional `/`, no spaces, max 15. */
export const SCHEDULE_FLIGHT_NO_MAX = 15;

export function sanitizeScheduleFlightNoInput(
  raw: string,
  maxLen = SCHEDULE_FLIGHT_NO_MAX,
): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[^A-Z0-9/]/g, '')
    .slice(0, Math.max(1, maxLen));
}

/**
 * Schedule Setup flight number: letters/digits, optional one `/` pair, ≤15, no spaces.
 * Examples: 6E205, AI101/AI102
 */
export function scheduleFlightNumber(
  value: string,
  label = 'Flight number',
): string | null {
  const v = sanitizeScheduleFlightNoInput(value);
  if (!v) return null;
  if (v.length > SCHEDULE_FLIGHT_NO_MAX) {
    return `${label} must be at most ${SCHEDULE_FLIGHT_NO_MAX} characters.`;
  }
  if (/^[A-Z0-9]{1,15}$/.test(v)) return null;
  if (/^[A-Z0-9]+\/[A-Z0-9]+$/.test(v) && v.length <= SCHEDULE_FLIGHT_NO_MAX) {
    return null;
  }
  return `${label} may only use letters, numbers, and one / (e.g. 6E205 or AI101/AI102). No spaces.`;
}

/** Schedule Setup routing live input: A–Z and `-` only, uppercased, no spaces. */
export function sanitizeScheduleRoutingInput(raw: string, maxLen = 11): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/–/g, '-')
    .replace(/[^A-Z-]/g, '')
    .slice(0, Math.max(1, maxLen));
}

/**
 * Schedule Setup routing: 2 or 3 IATA codes joined by `-`.
 * Examples: DEL-IXC, DEL-IXC-DEL
 */
export function scheduleRouting(value: string, label = 'Routing'): string | null {
  const v = sanitizeScheduleRoutingInput(value);
  if (!v) return null;
  if (!/^[A-Z]{3}(-[A-Z]{3}){1,2}$/.test(v)) {
    return `${label} must be 2 or 3 airport codes like DEL-IXC or DEL-IXC-DEL.`;
  }
  return null;
}

/** Routing string: letters, digits, spaces, hyphens, slashes. */
export function flightRouting(value: string, label = 'Routing'): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (v.length > 80) return `${label} must be at most 80 characters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-/]*$/.test(v)) {
    return `${label} may only contain letters, numbers, spaces, - and /.`;
  }
  return null;
}

export function dateRange(
  start: string,
  end: string,
  startLabel = 'Start date',
  endLabel = 'End date',
): string | null {
  const a = trimValue(start);
  const b = trimValue(end);
  if (!a || !b) return null;
  if (a > b) return `${endLabel} cannot be before ${startLabel}.`;
  return null;
}

/** HH:mm 24-hour. */
export function time24(value: string, label: string): string | null {
  const v = trimValue(value);
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
    return `${label} must be a valid 24-hour time (HH:mm).`;
  }
  return null;
}

/**
 * Flight number: A–Z / 0–9, optional hyphen, or turnaround pair with slash
 * (e.g. 6E205, AI-101, IX1089/IX1685).
 */
export function flightNumber(value: string, label = 'Flight number'): string | null {
  return creationFlightNumber(value, label);
}

export function fileType(
  file: File | null | undefined,
  allowedExt: string[],
  label = 'File',
): string | null {
  if (!file) return null;
  const name = file.name.toLowerCase();
  const ok = allowedExt.some((ext) => name.endsWith(ext.toLowerCase()));
  if (!ok) {
    return `${label} must be one of: ${allowedExt.join(', ')}.`;
  }
  return null;
}

export function fileMaxSize(
  file: File | null | undefined,
  maxBytes: number,
  label = 'File',
): string | null {
  if (!file) return null;
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return `${label} must be ${mb} MB or smaller.`;
  }
  return null;
}

/** Run validators in order; return first error. */
export function runValidators(
  ...results: Array<string | null | undefined>
): string | null {
  for (const r of results) {
    if (r) return r;
  }
  return null;
}

export function hasFieldErrors<K extends string>(errors: FieldErrors<K>): boolean {
  return Object.values(errors).some((m) => typeof m === 'string' && m.length > 0);
}

export function firstFieldErrorKey<K extends string>(
  order: readonly K[],
  errors: FieldErrors<K>,
): K | null {
  for (const key of order) {
    if (errors[key]) return key;
  }
  return null;
}

/** Focus element with id `field-{key}` or `key`. */
export function focusFirstInvalidField<K extends string>(
  order: readonly K[],
  errors: FieldErrors<K>,
): void {
  const key = firstFieldErrorKey(order, errors);
  if (!key || typeof document === 'undefined') return;
  const el =
    document.getElementById(`field-${key}`) ??
    document.getElementById(key) ??
    document.querySelector<HTMLElement>(`[name="${key}"]`);
  el?.focus();
}

export type FieldRule = {
  required?: boolean;
  label: string;
  minLength?: number;
  maxLength?: number;
  email?: boolean;
  phone?: boolean;
  airlineCode?: boolean;
  personName?: boolean;
  employeeId?: boolean;
  select?: boolean;
};

export function validateStringField(value: string, rule: FieldRule): string | null {
  const label = rule.label;
  if (rule.required || rule.select) {
    const req = rule.select ? selectRequired(value, label) : required(value, label);
    if (req) return req;
  }
  if (!normalizeText(value) && !trimValue(value)) return null;

  return runValidators(
    rule.minLength != null ? minLength(value, rule.minLength, label) : null,
    rule.maxLength != null ? maxLength(value, rule.maxLength, label) : null,
    rule.email ? email(value, label) : null,
    rule.phone ? phone(value, label) : null,
    rule.airlineCode ? airlineCode(value, label) : null,
    rule.personName ? personName(value, label) : null,
    rule.employeeId ? employeeId(value, label) : null,
  );
}

export function validateFormValues<K extends string>(
  values: Record<K, string>,
  rules: Partial<Record<K, FieldRule>>,
): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const key of Object.keys(rules) as K[]) {
    const rule = rules[key];
    if (!rule) continue;
    const msg = validateStringField(values[key] ?? '', rule);
    if (msg) errors[key] = msg;
  }
  return errors;
}
