/**
 * Invoice draft particulars preview cache (hover card).
 * Keys include user + station so sequential logins on the same tab cannot reuse
 * another user's draft line previews.
 */

export type InvoiceDraftParticularsPreview = {
  lines: Array<{
    lineNo: number;
    description: string;
    quantity: number;
    uom: string;
    lineAmountInclTax: number;
  }>;
  currencyCode: string;
};

/** Soft cap — drop oldest entries (Map insertion order) when exceeded. */
export const INVOICE_DRAFT_PARTICULARS_CACHE_MAX = 50;

const particularsCache = new Map<string, InvoiceDraftParticularsPreview>();

export function invoiceDraftParticularsCacheKey(
  userId: string,
  stationCode: string,
  draftId: string,
): string {
  const uid = String(userId ?? '').trim();
  const station = String(stationCode ?? '').trim().toUpperCase();
  const id = String(draftId ?? '').trim();
  return `${uid}|${station}|${id}`;
}

export function getInvoiceDraftParticulars(
  key: string,
): InvoiceDraftParticularsPreview | undefined {
  return particularsCache.get(key);
}

export function setInvoiceDraftParticulars(
  key: string,
  entry: InvoiceDraftParticularsPreview,
): void {
  if (!key) return;
  if (
    !particularsCache.has(key) &&
    particularsCache.size >= INVOICE_DRAFT_PARTICULARS_CACHE_MAX
  ) {
    const oldest = particularsCache.keys().next().value;
    if (oldest !== undefined) particularsCache.delete(oldest);
  }
  // Refresh insertion order for existing keys.
  if (particularsCache.has(key)) particularsCache.delete(key);
  particularsCache.set(key, entry);
}

/** Clear all draft preview entries (logout / workspace reset). */
export function clearInvoiceDraftParticularsCache(): void {
  particularsCache.clear();
}
