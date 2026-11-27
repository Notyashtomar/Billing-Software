/**
 * Uniform invoice PDF file name for every station: `station-service-month`
 * e.g. `dxn-bhs-sept.pdf`. Matches the combined month/airline download on the
 * Invoice drafts page so single and merged PDFs are named the same way.
 */

const MONTH_ABBREV = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'june',
  'july',
  'aug',
  'sept',
  'oct',
  'nov',
  'dec',
] as const;

function slug(value: unknown, fallback: string): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

export function invoicePeriodMonthAbbrev(periodStart: Date | string | null | undefined): string {
  if (!periodStart) return 'period';
  const date = periodStart instanceof Date ? periodStart : new Date(periodStart);
  if (Number.isNaN(date.getTime())) return 'period';
  return MONTH_ABBREV[date.getUTCMonth()] ?? 'period';
}

export function invoicePdfFileName(
  header: {
    stationCode?: string | null;
    invoiceCategory?: string | null;
    billingPeriodStart?: Date | string | null;
  },
  ext = 'pdf',
): string {
  const station = slug(header.stationCode, 'station');
  const service = slug(header.invoiceCategory, 'invoice');
  const month = invoicePeriodMonthAbbrev(header.billingPeriodStart);
  return `${station}-${service}-${month}.${ext}`;
}
