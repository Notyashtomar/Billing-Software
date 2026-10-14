import { BadRequestException } from '@nestjs/common';
import {
  isPaxShiftFlightDetailsDateKey,
  isPaxShiftFlightDetailsNumericKey,
  isPaxShiftFlightDetailsTimeKey,
  type PaxShiftFlightDetailsRecord,
} from '../constants/pax-shift-field-types';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function labelFor(field: string): string {
  return field.replace(/_/g, ' ');
}

/** Parse count fields; rejects non-integer strings (e.g. "12a", "abc"). */
export function coerceStrictInt(
  raw: unknown,
  field = 'field',
): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new BadRequestException(
        `${labelFor(field)} must be a non-negative whole number.`,
      );
    }
    return raw;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!/^\d+$/.test(s)) {
    throw new BadRequestException(
      `${labelFor(field)} must contain digits only (whole number).`,
    );
  }
  return parseInt(s, 10);
}

/** @deprecated Use coerceStrictInt for flight details. */
export function coerceOptionalInt(raw: unknown): number | undefined {
  return coerceStrictInt(raw);
}

export function coerceOptionalString(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

/** Normalize to `HH:mm`; rejects invalid time strings. */
export function coerceTimeHHmm(
  raw: unknown,
  field: string,
  allowEmpty = true,
): string | undefined {
  if (raw == null || raw === '') {
    if (allowEmpty) return undefined;
    throw new BadRequestException(`${labelFor(field)} time is required (HH:mm).`);
  }
  const s = String(raw).trim().replace(/\./g, ':');
  if (!s) {
    if (allowEmpty) return undefined;
    throw new BadRequestException(`${labelFor(field)} time is required (HH:mm).`);
  }
  const parts = s.split(':').map((p) => p.trim());
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = (parts[1] ?? '00').padStart(2, '0').slice(0, 2);
  const normalized = `${h.slice(0, 2)}:${m}`;
  if (!TIME_HH_MM.test(normalized)) {
    throw new BadRequestException(
      `${labelFor(field)} must be a valid time in HH:mm format (00:00–23:59).`,
    );
  }
  return normalized;
}

/** Normalize to `yyyy-MM-dd`; rejects invalid date strings. */
export function coerceDateYmd(
  raw: unknown,
  field: string,
  allowEmpty = true,
): string | undefined {
  if (raw == null || raw === '') {
    if (allowEmpty) return undefined;
    throw new BadRequestException(`${labelFor(field)} date is required (yyyy-MM-dd).`);
  }
  const s = String(raw).trim();
  if (!s) {
    if (allowEmpty) return undefined;
    throw new BadRequestException(`${labelFor(field)} date is required (yyyy-MM-dd).`);
  }
  let ymd = s;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const [, d, m, y] = slash;
    ymd = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  if (!DATE_YMD.test(ymd)) {
    throw new BadRequestException(
      `${labelFor(field)} must be a valid date (yyyy-MM-dd).`,
    );
  }
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m! - 1 ||
    dt.getDate() !== d
  ) {
    throw new BadRequestException(`${labelFor(field)} is not a valid calendar date.`);
  }
  return ymd;
}

/** Normalize flight handling form payload for MongoDB `flightDetails`. */
export function normalizeFlightDetails(
  raw: Record<string, unknown> | undefined,
): PaxShiftFlightDetailsRecord {
  const out: PaxShiftFlightDetailsRecord = {};
  if (!raw || typeof raw !== 'object') return out;

  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim();
    if (!k) continue;
    if (isPaxShiftFlightDetailsNumericKey(k)) {
      const n = coerceStrictInt(value, k);
      if (n !== undefined) out[k] = n;
      continue;
    }
    if (isPaxShiftFlightDetailsTimeKey(k)) {
      const optionalTimes = new Set([
        'ata',
        'atd',
        'gt',
        'agt',
        'groundTime',
        'addCabinDoorClosed',
        'addHoldClosed',
        'addCrewBoarded',
      ]);
      const t = coerceTimeHHmm(value, k, optionalTimes.has(k));
      if (t !== undefined) out[k] = t;
      continue;
    }
    if (isPaxShiftFlightDetailsDateKey(k)) {
      const d = coerceDateYmd(value, k, true);
      if (d !== undefined) out[k] = d;
      continue;
    }
    const s = coerceOptionalString(value);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

/** Short shipped bags — bag count as non-negative integer. */
export function normalizeNoOfBags(raw: unknown): number | undefined {
  return coerceStrictInt(raw, 'noOfBags');
}

export function noOfBagsHasValue(n: number | undefined): boolean {
  return n !== undefined && n > 0;
}
