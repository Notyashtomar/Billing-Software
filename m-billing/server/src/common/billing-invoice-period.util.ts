/** Open invoice workflow states that can still absorb preparation rows for the same period. */
export const OPEN_INVOICE_DRAFT_STATUSES = ['draft', 'pending_approval'] as const;

/** Final invoice states — at most one per customer + billing period. */
export const FINAL_INVOICE_STATUSES = ['approved', 'generated', 'posted'] as const;

function ymdOnly(raw: string): string {
  return String(raw ?? '').trim().slice(0, 10);
}

/** Inclusive UTC start of YYYY-MM-DD (matches preparation list filters). */
export function preparationPeriodBoundStart(ymd: string): Date {
  const day = ymdOnly(ymd);
  const d = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? new Date(ymd) : d;
}

/** Inclusive UTC end of YYYY-MM-DD (matches preparation list filters). */
export function preparationPeriodBoundEnd(ymd: string): Date {
  const day = ymdOnly(ymd);
  const d = new Date(`${day}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? new Date(ymd) : d;
}

/**
 * Mongo filter on `billingPeriodStart` for preparation list + create-drafts.
 * Must stay aligned with `BillingPreparationService.list` period bounds.
 */
export function preparationListPeriodFilter(
  from?: string,
  to?: string,
): Record<string, Date> | undefined {
  const fromYmd = from?.trim();
  const toYmd = to?.trim();
  if (!fromYmd && !toYmd) return undefined;
  const period: Record<string, Date> = {};
  if (fromYmd) period.$gte = preparationPeriodBoundStart(fromYmd);
  if (toYmd) period.$lte = preparationPeriodBoundEnd(toYmd);
  return period;
}

/** Invoice category for draft grouping — keeps ADS tax invoices separate from BHS. */
export function preparationInvoiceCategory(
  sourceType: string | undefined,
): 'BHS' | 'ADS' | 'RAF' | 'CUSTOM' | 'MAAS' | 'OTHER' {
  const t = String(sourceType ?? '').trim().toLowerCase();
  if (t === 'scheduled_flight') return 'BHS';
  if (t === 'ads' || t === 'equipment' || t === 'manpower' || t === 'cleaning') {
    return 'ADS';
  }
  if (t === 'raf') return 'RAF';
  if (t === 'custom') return 'CUSTOM';
  if (t === 'maas') return 'MAAS';
  return 'OTHER';
}

export function preparationInvoiceGroupKey(record: {
  customerCode: string;
  billingPeriodStart?: Date | string;
  billingPeriodEnd?: Date | string;
  sourceType?: string;
}): string {
  const start = toYmd(record.billingPeriodStart);
  const end = toYmd(record.billingPeriodEnd);
  const category = preparationInvoiceCategory(record.sourceType);
  return `${String(record.customerCode ?? '').toUpperCase()}|${start}|${end}|${category}`;
}

export function exactBillingPeriodMatch(
  customerCode: string,
  billingPeriodStart: Date | string,
  billingPeriodEnd: Date | string,
): Record<string, unknown> {
  return {
    customerCode: String(customerCode).toUpperCase(),
    billingPeriodStart: new Date(billingPeriodStart),
    billingPeriodEnd: new Date(billingPeriodEnd),
  };
}

function toYmd(value: Date | string | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
