/** Excel customer-master codes look like `AC-MAA` / `6E-MA`. Match DB IATA `code`. */
export function excelAirlineCodePrefix(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .split('-')[0]
    .replace(/[^A-Z0-9]/g, '');
}

type ExcelAirlineRow = {
  excelCode: string;
  operation: string;
};

/**
 * One DB airline code can appear as several excel rows (Schedule vs Non-Schedule,
 * `-OLD` duplicates). Prefer live Schedule, then `-MAA`, then first remaining.
 */
export function pickExcelAirlineRow<T extends ExcelAirlineRow>(
  rows: T[],
): T | null {
  if (!rows.length) return null;
  const notOld = rows.filter((r) => !/-OLD$/i.test(r.excelCode));
  const pool = notOld.length ? notOld : rows;
  const schedule = pool.filter((r) => /^schedule/i.test(r.operation));
  const pool2 = schedule.length ? schedule : pool;
  const maa = pool2.filter((r) => /-(MAA)$/i.test(r.excelCode));
  return maa[0] || pool2[0] || null;
}
