export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Display total ground-time minutes as hours (bird report ACTUAL GT / GT SAVED). */
export function formatGroundHoursShort(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 h';
  const h = totalMinutes / 60;
  if (h >= 100) return `${Math.round(h).toLocaleString()} h`;
  const rounded = Math.round(h * 10) / 10;
  return `${(Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1))} h`;
}
