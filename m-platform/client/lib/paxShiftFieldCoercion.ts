/**
 * Pax Shift field types — mirrors server `pax-shift-field-coercion.util.ts`.
 */

import type { ClipboardEvent, KeyboardEvent } from 'react';

export const PAX_SHIFT_FLIGHT_DETAILS_NUMERIC_KEYS = new Set([
  'uhCounters',
  'delayMins',
  'level4Bags',
  'mhbPir',
  'mhbBag1',
  'mhbDpr',
  'mhbBag2',
  'mhbOhd',
  'mhbAoc',
  'mhbBagClmcFig',
  'mhbBagShort',
  'addTeleChk',
  'addWebChk',
  'addMilesMore',
  'addDepu',
  'addDepa',
  'addInad',
  'addOffloadImmig',
  'addGateNoShow',
  'addCussCheckin',
]);

export const PAX_SHIFT_FLIGHT_DETAILS_TIME_KEYS = new Set([
  'sta',
  'std',
  'eta',
  'ata',
  'etd',
  'atd',
  'gt',
  'agt',
  'groundTime',
  'addCabinDoorClosed',
  'addHoldClosed',
  'addCrewBoarded',
]);

export const PAX_SHIFT_FLIGHT_DETAILS_DATE_KEYS = new Set([
  'flightDate',
  'compiledDate',
]);

const PAX_ROW_PREFIX = /^pax_(arrivals|departures)_/;
const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isPaxShiftFlightDetailsNumericKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (PAX_SHIFT_FLIGHT_DETAILS_NUMERIC_KEYS.has(k)) return true;
  return PAX_ROW_PREFIX.test(k);
}

export function isPaxShiftFlightDetailsTimeKey(key: string): boolean {
  return PAX_SHIFT_FLIGHT_DETAILS_TIME_KEYS.has(key.trim());
}

export function isPaxShiftFlightDetailsDateKey(key: string): boolean {
  return PAX_SHIFT_FLIGHT_DETAILS_DATE_KEYS.has(key.trim());
}

export type PaxShiftFlightDetailsValue = string | number;
export type PaxShiftFlightDetailsRecord = Record<string, PaxShiftFlightDetailsValue>;

function fieldLabel(field: string): string {
  return field.replace(/_/g, ' ');
}

export function coerceStrictInt(
  raw: unknown,
  field = 'field',
): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new Error(`${fieldLabel(field)} must be a non-negative whole number.`);
    }
    return raw;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!/^\d+$/.test(s)) {
    throw new Error(`${fieldLabel(field)} must contain digits only (whole number).`);
  }
  return parseInt(s, 10);
}

export function coerceTimeHHmm(
  raw: unknown,
  field: string,
  allowEmpty = true,
): string | undefined {
  if (raw == null || raw === '') {
    if (allowEmpty) return undefined;
    throw new Error(`${fieldLabel(field)} time is required (HH:mm).`);
  }
  const s = String(raw).trim().replace(/\./g, ':');
  if (!s) {
    if (allowEmpty) return undefined;
    throw new Error(`${fieldLabel(field)} time is required (HH:mm).`);
  }
  const parts = s.split(':').map((p) => p.trim());
  const h = (parts[0] ?? '00').padStart(2, '0').slice(0, 2);
  const m = (parts[1] ?? '00').padStart(2, '0').slice(0, 2);
  const normalized = `${h}:${m}`;
  if (!TIME_HH_MM.test(normalized)) {
    throw new Error(
      `${fieldLabel(field)} must be a valid time in HH:mm format (00:00–23:59).`,
    );
  }
  return normalized;
}

export function coerceDateYmd(
  raw: unknown,
  field: string,
  allowEmpty = true,
): string | undefined {
  if (raw == null || raw === '') {
    if (allowEmpty) return undefined;
    throw new Error(`${fieldLabel(field)} date is required.`);
  }
  const s = String(raw).trim();
  if (!s) {
    if (allowEmpty) return undefined;
    throw new Error(`${fieldLabel(field)} date is required.`);
  }
  let ymd = s;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const [, d, m, y] = slash;
    ymd = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  if (!DATE_YMD.test(ymd)) {
    throw new Error(`${fieldLabel(field)} must be a valid date (use the date picker).`);
  }
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d!);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo! - 1 || dt.getDate() !== d) {
    throw new Error(`${fieldLabel(field)} is not a valid calendar date.`);
  }
  return ymd;
}

const OPTIONAL_TIME_KEYS = new Set([
  'ata',
  'atd',
  'gt',
  'agt',
  'groundTime',
  'addCabinDoorClosed',
  'addHoldClosed',
  'addCrewBoarded',
]);

/** Coerce and validate form payload before PUT. */
export function normalizeFlightDetailsForSave(
  raw: Record<string, unknown>,
): PaxShiftFlightDetailsRecord {
  const out: PaxShiftFlightDetailsRecord = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim();
    if (!k) continue;
    if (isPaxShiftFlightDetailsNumericKey(k)) {
      const n = coerceStrictInt(value, k);
      if (n !== undefined) out[k] = n;
      continue;
    }
    if (isPaxShiftFlightDetailsTimeKey(k)) {
      const t = coerceTimeHHmm(value, k, OPTIONAL_TIME_KEYS.has(k));
      if (t !== undefined) out[k] = t;
      continue;
    }
    if (isPaxShiftFlightDetailsDateKey(k)) {
      const d = coerceDateYmd(value, k, true);
      if (d !== undefined) out[k] = d;
      continue;
    }
    const s = String(value ?? '').trim();
    if (s) out[k] = s;
  }
  return out;
}

/** Display value for text/number inputs. */
export function flightDetailsValueForInput(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return String(raw).trim();
}

export function normalizeNoOfBagsForSave(raw: unknown): number | undefined {
  return coerceStrictInt(raw, 'noOfBags');
}

export function noOfBagsForInput(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw));
  return String(raw).replace(/\D/g, '');
}

export function noOfBagsForDisplay(raw: unknown): string {
  try {
    const n = coerceStrictInt(raw, 'noOfBags');
    return n !== undefined && n > 0 ? String(n) : '';
  } catch {
    return '';
  }
}

/** Block non-digit keys in integer fields. */
export function blockNonIntegerKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
  if (['e', 'E', '+', '-', '.', ','].includes(e.key)) {
    e.preventDefault();
  }
}

export function blockNonIntegerPaste(e: ClipboardEvent<HTMLInputElement>): void {
  const t = e.clipboardData.getData('text');
  if (t && !/^\d*$/.test(t.trim())) {
    e.preventDefault();
  }
}
