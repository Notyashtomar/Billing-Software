import type { BillingPreparationRecord } from './types';

export type PreparationFlightKind = 'cancelled' | 'scheduled' | 'additional';

export type PreparationFlightKindFilter = 'all' | PreparationFlightKind;

/** Same rules as the billing API `stripCancelledFlightPrefix`. */
function stripOneCancelledToken(part: string): string {
  const spaced = part.replace(/^CANC[\s-]+/i, '').trim();
  if (spaced !== part) return spaced;
  return part.replace(/^CANC(?=[A-Z]{1,3}\d)/i, '');
}

export function stripCancelledFlightPrefix(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (!text.includes('/')) return stripOneCancelledToken(text);
  return text
    .split('/')
    .map((part) => stripOneCancelledToken(part.trim()))
    .filter(Boolean)
    .join('/');
}

function snapshot(row: BillingPreparationRecord): Record<string, unknown> {
  return (row.operationalSnapshot ?? {}) as Record<string, unknown>;
}

function rawFlightTokens(row: BillingPreparationRecord): string[] {
  const snap = snapshot(row);
  return [
    row.sourceRef?.flightNo,
    snap.flightNo,
    snap.flightNoEquipmentNo,
    snap['Flight No'],
    snap.ArrivalFltNo,
    snap.DepartureFltNo,
  ].map((value) => String(value ?? '').trim());
}

/** Operating flight number for preparation tables (CANC prefix removed). */
export function preparationDisplayFlightNo(row: BillingPreparationRecord): string {
  const snap = snapshot(row);
  const arrival = String(snap.ArrivalFltNo ?? '').trim();
  const departure = String(snap.DepartureFltNo ?? '').trim();
  const combined =
    arrival && departure && !arrival.toUpperCase().startsWith('CANC')
      ? `${arrival}/${departure}`
      : '';
  const candidates = [...rawFlightTokens(row), combined];
  for (const value of candidates) {
    const stripped = stripCancelledFlightPrefix(value);
    if (stripped) return stripped;
  }
  return '';
}

function isCancelledPreparationRow(row: BillingPreparationRecord): boolean {
  const snap = snapshot(row);
  if (
    snap.isCancelled === true ||
    snap.cancelled === true ||
    snap.flightCancelled === true ||
    String(snap.flightStatus ?? '')
      .trim()
      .toLowerCase() === 'cancelled'
  ) {
    return true;
  }
  if (
    rawFlightTokens(row).some((token) => token.toUpperCase().startsWith('CANC'))
  ) {
    return true;
  }
  return (row.validationResults ?? []).some(
    (result) => result.rule === 'not_cancelled' && !result.passed,
  );
}

function isAdditionalPreparationRow(row: BillingPreparationRecord): boolean {
  const snap = snapshot(row);
  const handling = [
    snap.typeOfHandling,
    snap.TypeofHandling,
    snap.typeofHandling,
    snap.ops,
    snap.opsType,
    snap.typeOfFlight,
    snap.Typeofflight,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return /\badditional\b/i.test(handling);
}

/**
 * Validation-error filter buckets. A cancelled additional flight stays under
 * Cancelled so the three choices do not overlap.
 */
export function preparationFlightKind(
  row: BillingPreparationRecord,
): PreparationFlightKind {
  if (isCancelledPreparationRow(row)) return 'cancelled';
  if (isAdditionalPreparationRow(row)) return 'additional';
  return 'scheduled';
}
