/** Shared billing domain enums — used by billing/server and billing/client. */

export const CUTOVER_PHASES = [
  'parallel',
  'fris_primary',
  'bc_readonly',
  'decommissioned',
] as const;
export type CutoverPhase = (typeof CUTOVER_PHASES)[number];

export const CURRENCY_CODES = ['INR', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CONTRACT_CATEGORIES = ['Dom', 'Int', 'Both'] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

export const PRICE_CARD_AIRLINE_CATEGORIES = ['Dom', 'Int'] as const;
/** Includes legacy `Ta` (Turnaround) still present on older stored rows. */
export type PriceCardAirlineCategory = 'Dom' | 'Int' | 'Ta';

export const CONTRACT_STATUSES = ['draft', 'active', 'expired'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_CONCESSION_SCENARIOS = [
  'int',
  'dom',
  'divertedDom',
  'divertedInt',
  'returnToRamp',
  'cancellationWithinHoursPercent',
  'technicalHandlingChargesPercent',
  'standbyChargesPercent',
  'filoLifoChargesPercent',
  'delayChargesPercent',
  'domesticCargo',
  'internationalCargo',
] as const;
export type ContractConcessionScenario = (typeof CONTRACT_CONCESSION_SCENARIOS)[number];

export const SERVICE_CATALOG_CATEGORIES = [
  'scheduled',
  'non_scheduled',
  'raf',
  'xxld',
  'delay',
  'cleaning',
  'maas',
  'manpower',
  'equipment',
] as const;
export type ServiceCatalogCategory = (typeof SERVICE_CATALOG_CATEGORIES)[number];

export const PREPARATION_STATUSES = [
  'eligible',
  'pending',
  'validation_error',
  'rejected',
  'ready_for_invoice',
  'invoiced',
] as const;
export type PreparationStatus = (typeof PREPARATION_STATUSES)[number];

export const PREPARATION_SOURCE_TYPES = [
  'scheduled_flight',
  'equipment',
  'cleaning',
  'raf',
  'maas',
  'ads',
  'xxld',
  'manpower',
  'non_scheduled',
  'custom',
] as const;
export type PreparationSourceType = (typeof PREPARATION_SOURCE_TYPES)[number];

export const INVOICE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'generated',
  'posted',
  'cancelled',
  'archived',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CREDIT_MEMO_STATUSES = ['draft', 'posted'] as const;
export type CreditMemoStatus = (typeof CREDIT_MEMO_STATUSES)[number];

export const CREDIT_MEMO_REASONS = [
  'xxld_not_chargeable',
  'delay_dispute',
  'correction',
  'other',
] as const;
export type CreditMemoReason = (typeof CREDIT_MEMO_REASONS)[number];

export const AUDIT_ACTIONS = [
  'created',
  'updated',
  'approved',
  'rejected',
  'generated',
  'posted',
  'exported',
  'downloaded',
  'cancelled',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const DOCUMENT_TYPES = ['invoice', 'credit_memo'] as const;
export type BillingDocumentType = (typeof DOCUMENT_TYPES)[number];

export const EXCHANGE_RATE_SOURCES = ['manual', 'rbi', 'import'] as const;
export type ExchangeRateSource = (typeof EXCHANGE_RATE_SOURCES)[number];

export const PLACE_OF_SUPPLY = ['intra_state', 'inter_state'] as const;
export type PlaceOfSupply = (typeof PLACE_OF_SUPPLY)[number];

/** Airline KYC case workflow statuses. */
export const KYC_STATUSES = [
  'draft',
  'invited',
  'in_progress',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'expired',
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_DOCUMENT_TYPES = [
  'gst_certificate',
  'pan_card',
  'cancelled_cheque',
  'authorization_letter',
  'other',
] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];
