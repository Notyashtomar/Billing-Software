/**
 * These master screens are stored for reference only.
 * Invoice create, regenerate, refresh, preparation pricing, and PDF
 * must not read them. Concession and royalty on an invoice come from the
 * airline contract. Aircraft body and equipment come from the flight record.
 */
export const BILLING_INVOICE_IGNORED_MASTERS = [
  'royalty-setup',
  'airport-setup-configure-rules',
  'aircraft-master',
  'equipment-master',
] as const;

type IgnoredMasterFields = {
  airportCommercial?: unknown;
  royaltyMaster?: unknown;
};

/** Drop Configure rules and Royalty Setup before any invoice or PDF use. */
export function billingSettingsForInvoicing<T extends IgnoredMasterFields>(
  settings: T | null | undefined,
): Omit<T, 'airportCommercial' | 'royaltyMaster'> | null {
  if (!settings) return null;
  const rest = { ...settings };
  delete rest.airportCommercial;
  delete rest.royaltyMaster;
  return rest;
}
