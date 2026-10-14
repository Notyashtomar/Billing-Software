/** Shared KYC form merge + completeness (staff + invite paths). */

export type BillingKycFormShape = {
  legalName?: string;
  country?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  msme?: string;
  currencyCode?: string;
  billingContactName?: string;
  billingContactEmail?: string;
  billingContactPhone?: string;
  opsContactName?: string;
  opsContactEmail?: string;
  opsContactPhone?: string;
  bankAccountName?: string;
  bankName?: string;
  bankIfscOrSwift?: string;
  bankAccountNumber?: string;
};

const REQUIRED_FIELDS: Array<keyof BillingKycFormShape> = [
  'legalName',
  'address',
  'gstin',
  'pan',
  'billingContactName',
  'billingContactEmail',
];

const ALL_FIELDS: Array<keyof BillingKycFormShape> = [
  'legalName',
  'country',
  'address',
  'gstin',
  'pan',
  'msme',
  'currencyCode',
  'billingContactName',
  'billingContactEmail',
  'billingContactPhone',
  'opsContactName',
  'opsContactEmail',
  'opsContactPhone',
  'bankAccountName',
  'bankName',
  'bankIfscOrSwift',
  'bankAccountNumber',
];

function filled(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

export function mergeKycForm(
  current: BillingKycFormShape | Record<string, unknown> | null | undefined,
  patch: BillingKycFormShape | Record<string, unknown> | null | undefined,
): BillingKycFormShape {
  const base = { ...(current ?? {}) } as BillingKycFormShape;
  if (!patch || typeof patch !== 'object') return base;
  for (const key of ALL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const raw = (patch as BillingKycFormShape)[key];
      if (raw == null) {
        delete base[key];
      } else {
        base[key] = String(raw).trim();
      }
    }
  }
  return base;
}

export function computeKycCompleteness(
  form: BillingKycFormShape | Record<string, unknown> | null | undefined,
  documentCount = 0,
): number {
  const f = (form ?? {}) as BillingKycFormShape;
  let score = 0;
  let total = REQUIRED_FIELDS.length + 2; // + docs hint + currency
  for (const key of REQUIRED_FIELDS) {
    if (filled(f[key])) score += 1;
  }
  if (filled(f.currencyCode)) score += 1;
  if (documentCount > 0) score += 1;
  return Math.round((score / total) * 100);
}

export function assertKycReadyForSubmit(
  form: BillingKycFormShape | Record<string, unknown> | null | undefined,
): string[] {
  const f = (form ?? {}) as BillingKycFormShape;
  const missing: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    if (!filled(f[key])) missing.push(String(key));
  }
  return missing;
}

export function sanitizeKycCaseForClient(doc: Record<string, unknown>) {
  const { inviteTokenHash: _hash, ...rest } = doc;
  return rest;
}
