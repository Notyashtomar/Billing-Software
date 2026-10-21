export const CUSTOMER_ANNEXURE_CATEGORIES = ['ADS', 'BHS'] as const;
export type CustomerAnnexureCategory = (typeof CUSTOMER_ANNEXURE_CATEGORIES)[number];

export type StoredCustomerAnnexure = {
  fileKey?: string;
  originalName?: string;
  mimeType?: string;
  uploadedAt?: Date | string;
};

export type StoredCustomerAnnexures = {
  ads?: StoredCustomerAnnexure | null;
  bhs?: StoredCustomerAnnexure | null;
};

export type PublicCustomerAnnexure = {
  originalName: string;
  uploadedAt?: Date | string;
};

export function parseCustomerAnnexureCategory(
  value: unknown,
): CustomerAnnexureCategory | null {
  const category = String(value ?? '')
    .trim()
    .toUpperCase();
  if (category === 'ADS' || category === 'BHS') return category;
  return null;
}

export function annexureStorageField(
  category: CustomerAnnexureCategory,
): 'ads' | 'bhs' {
  return category === 'ADS' ? 'ads' : 'bhs';
}

export function publicCustomerAnnexures(
  annexures?: StoredCustomerAnnexures | null,
): { ads?: PublicCustomerAnnexure; bhs?: PublicCustomerAnnexure } | undefined {
  if (!annexures) return undefined;
  const out: { ads?: PublicCustomerAnnexure; bhs?: PublicCustomerAnnexure } = {};
  for (const field of ['ads', 'bhs'] as const) {
    const file = annexures[field];
    const originalName = String(file?.originalName ?? '').trim();
    if (!originalName || !file?.fileKey) continue;
    out[field] = {
      originalName,
      uploadedAt: file.uploadedAt,
    };
  }
  return out.ads || out.bhs ? out : undefined;
}

export function isPdfAnnexure(file: {
  buffer?: Buffer | null;
  mimetype?: string | null;
  originalname?: string | null;
}): boolean {
  const buffer = file.buffer;
  if (!buffer?.length) return false;
  const name = String(file.originalname ?? '').toLowerCase();
  const mime = String(file.mimetype ?? '').toLowerCase();
  const namedPdf =
    mime === 'application/pdf' || mime === 'application/x-pdf' || name.endsWith('.pdf');
  if (!namedPdf) return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  return head.includes('%PDF-');
}

export function annexureDownloadName(
  originalName: string | undefined,
  customerCode: string,
  category: CustomerAnnexureCategory,
): string {
  const cleaned = String(originalName ?? '')
    .replace(/[\r\n"\\]/g, '')
    .trim();
  const fallback = `${customerCode}-${category}-annexure.pdf`;
  const chosen = cleaned.toLowerCase().endsWith('.pdf') ? cleaned : fallback;
  return chosen.slice(0, 180) || fallback;
}

export function annexureContentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
