/** Trim and uppercase airline codes — no collection/type prefix on the code itself. */
export function normalizeAirlineCode(raw: string | undefined | null): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function normalizeAirlineName(raw: string | undefined | null): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

/** Mongo collection — `NS` lives on the collection name, not on `airlineCode`. */
export const NS_ADVANCE_NON_SCHEDULED_AIRLINE_COLLECTION =
  'ns-advance-non-scheduled-airline';
