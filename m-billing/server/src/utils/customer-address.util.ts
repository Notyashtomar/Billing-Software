/** Bill-to name on the invoice. Airline invoice name wins; otherwise the customer name. */
export function resolveBillingCustomerInvoiceName(
  customer?: { name?: string; airlineInvoiceName?: string } | null,
  fallback?: string,
): string {
  return (
    customer?.airlineInvoiceName?.trim() ||
    customer?.name?.trim() ||
    fallback?.trim() ||
    ''
  );
}

/** Bill-to address from billing customer master (supports legacy globalDimension2). */
export function resolveBillingCustomerAddress(
  customer?: {
    address?: string;
    globalDimension2?: string;
    secondaryAddress?: string;
    secondaryAddressEnabled?: boolean;
  } | null,
): string | undefined {
  const primary = customer?.address?.trim() || customer?.globalDimension2?.trim() || '';
  const secondary =
    customer?.secondaryAddressEnabled === true
      ? customer.secondaryAddress?.trim() || ''
      : '';
  if (primary && secondary) return `${primary}\n${secondary}`;
  return primary || secondary || undefined;
}

export type ParentCompanyAddressSource = {
  address?: string;
  address2?: string;
  address3?: string;
};

/** Join Advance airline parent-company address lines. Never includes airline name. */
export function formatParentCompanyAddress(
  source?: ParentCompanyAddressSource | null,
): string | undefined {
  if (!source) return undefined;
  const lines = [source.address, source.address2, source.address3]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return lines.length ? lines.join('\n') : undefined;
}
