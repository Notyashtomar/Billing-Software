/** Placeholder for blank FHR report / PDF field values. */
export const FHR_EMPTY_DASH = '-';

export function isFhrFieldEmpty(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (s === '') return true;
  // Treat legacy / seeded "NA" placeholders as empty so PDF shows `-`.
  if (/^n\/?a$/i.test(s)) return true;
  return false;
}

/** Empty → `-`; otherwise trimmed string (keeps `0`). */
export function fhrDisplayValue(value: unknown): string {
  if (isFhrFieldEmpty(value)) return FHR_EMPTY_DASH;
  return String(value).trim();
}
