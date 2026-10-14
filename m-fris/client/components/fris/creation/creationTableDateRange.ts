export function formatDisplayDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function parseDisplayDate(ddMmYyyy: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddMmYyyy ?? '').trim());
  if (!m) return null;
  const parsed = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function compareDisplayDates(a: string, b: string): number {
  const da = parseDisplayDate(a);
  const db = parseDisplayDate(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

export function clampTableDateRange(
  fromDate: string,
  toDate: string,
): { fromDate: string; toDate: string } {
  if (!fromDate.trim()) return { fromDate, toDate };
  if (!toDate.trim() || compareDisplayDates(fromDate, toDate) > 0) {
    return { fromDate, toDate: fromDate };
  }
  return { fromDate, toDate };
}

export function defaultTableDateRange(today = new Date()): { fromDate: string; toDate: string } {
  const value = formatDisplayDate(today);
  return { fromDate: value, toDate: value };
}
