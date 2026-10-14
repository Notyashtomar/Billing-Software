export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function endOfCalendarMonth(year: number, month1to12: number): Date {
  return new Date(year, month1to12, 0);
}

export function formatMinutesAsDisplay(total: number): string {
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(Math.round(total));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

export function ymdToDdMmYyyy(ymd: string): string {
  const [y, mo, d] = ymd.split('-');
  if (!y || !mo || !d) return ymd;
  return `${d}/${mo}/${y}`;
}

export function exportCodesCsv(
  rows: Array<{
    code: string;
    description: string;
    flightCount: number;
    totalMinutes: number;
    avgMinutes: number;
    pctContribution: number;
  }>,
  filename: string,
): void {
  const header = 'Code,Description,Flights Delayed,Total Delay Minutes,Avg Delay Minutes,% Contribution';
  const lines = rows.map(
    (r) =>
      `${r.code},"${r.description.replace(/"/g, '""')}",${r.flightCount},${r.totalMinutes},${r.avgMinutes},${r.pctContribution}`,
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
