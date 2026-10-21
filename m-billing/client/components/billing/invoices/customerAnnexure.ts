export type CustomerAnnexureCategory = 'ADS' | 'BHS';

export type CustomerAnnexureFileMeta = {
  originalName?: string;
  uploadedAt?: string;
};

export type CustomerAnnexures = {
  ads?: CustomerAnnexureFileMeta;
  bhs?: CustomerAnnexureFileMeta;
};

/** ADS and BHS invoices open the annexure saved for that category. */
export function annexureCategoryForInvoice(
  invoiceCategory?: string | null,
): CustomerAnnexureCategory | null {
  const category = String(invoiceCategory ?? '')
    .trim()
    .toUpperCase();
  if (category === 'ADS' || category === 'BHS') return category;
  return null;
}

export function savedAnnexureForInvoice(
  invoiceCategory: string | null | undefined,
  annexures: CustomerAnnexures | null | undefined,
): { category: CustomerAnnexureCategory; file: CustomerAnnexureFileMeta } | null {
  const category = annexureCategoryForInvoice(invoiceCategory);
  if (!category || !annexures) return null;
  const file = category === 'ADS' ? annexures.ads : annexures.bhs;
  if (!file?.originalName?.trim()) return null;
  return { category, file };
}
