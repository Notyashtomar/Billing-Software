/**
 * Deep-link helpers for the Reports → Cleaning Services Data Export page.
 *
 * Clicking a flight serial opens that flight in Flights → Scheduled Airlines
 * (highlighted). A "Back to cleaning services" button returns to this page with
 * the same filters so the table re-populates exactly as it was.
 */
const CLEANING_SERVICES_PATH = '/fris/reports/cleaning-services';

export type CleaningServicesReturnContext = {
  fromYmd: string;
  toYmd: string;
  customer?: string;
  frisNo?: string;
  exportedStatus?: string;
};

export function buildScheduledAirlinesHrefFromCleaningServices(
  serial: number | string,
  ctx: CleaningServicesReturnContext,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(serial).trim());
  p.set('from', ctx.fromYmd);
  p.set('to', ctx.toYmd);
  p.set('returnTo', CLEANING_SERVICES_PATH);
  p.set('csFrom', ctx.fromYmd);
  p.set('csTo', ctx.toYmd);
  if (ctx.customer?.trim()) p.set('csCustomer', ctx.customer.trim());
  if (ctx.frisNo?.trim()) p.set('csFris', ctx.frisNo.trim());
  if (ctx.exportedStatus?.trim()) p.set('csStatus', ctx.exportedStatus.trim());
  return `/fris/flights/scheduledairlines?${p.toString()}`;
}

export function buildCleaningServicesReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim();
  if (!returnTo || returnTo !== CLEANING_SERVICES_PATH) return null;

  const out = new URLSearchParams();
  const from = params.get('csFrom')?.trim() || params.get('from')?.trim() || '';
  const to = params.get('csTo')?.trim() || params.get('to')?.trim() || '';
  const customer = params.get('csCustomer')?.trim() || '';
  const fris = params.get('csFris')?.trim() || '';
  const status = params.get('csStatus')?.trim() || '';
  if (from) out.set('csFrom', from);
  if (to) out.set('csTo', to);
  if (customer) out.set('csCustomer', customer);
  if (fris) out.set('csFris', fris);
  if (status) out.set('csStatus', status);

  const qs = out.toString();
  return qs ? `${CLEANING_SERVICES_PATH}?${qs}` : CLEANING_SERVICES_PATH;
}

export function cleaningServicesReturnLabel(): string {
  return 'Back to cleaning services';
}

/** Restore the filters when arriving back on the cleaning services page. */
export function parseCleaningServicesReturnFromUrl(
  params: Pick<URLSearchParams, 'get'>,
): {
  fromYmd: string | null;
  toYmd: string | null;
  customer: string | null;
  frisNo: string | null;
  exportedStatus: string | null;
} | null {
  const from = params.get('csFrom')?.trim() || '';
  const to = params.get('csTo')?.trim() || '';
  const customer = params.get('csCustomer')?.trim() || '';
  const fris = params.get('csFris')?.trim() || '';
  const status = params.get('csStatus')?.trim() || '';
  if (!from && !to && !customer && !fris && !status) return null;
  return {
    fromYmd: from || null,
    toYmd: to || null,
    customer: customer || null,
    frisNo: fris || null,
    exportedStatus: status || null,
  };
}
