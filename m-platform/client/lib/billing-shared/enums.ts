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

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  Dom: 'Domestic',
  Int: 'International',
  Both: 'Domestic & International',
};

/** BHS / ADS / RAF airline price-card rows — Domestic or International only. */
export const PRICE_CARD_AIRLINE_CATEGORIES = ['Dom', 'Int'] as const;
/** Includes legacy `Ta` (Turnaround) still present on older stored rows. */
export type PriceCardAirlineCategory = 'Dom' | 'Int' | 'Ta';

export const PRICE_CARD_AIRLINE_CATEGORY_LABELS: Record<PriceCardAirlineCategory, string> = {
  Dom: 'Domestic',
  Int: 'International',
  Ta: 'Turnaround',
};

/** A stored end date of 2090 or later means the sheet said the rate is open-ended. */
export function isOpenEndedBillingDate(value: string | undefined | null): boolean {
  const year = Number(String(value ?? '').slice(0, 4));
  return Number.isFinite(year) && year >= 2090;
}

export function formatContractCategory(category: ContractCategory | string): string {
  if (category === 'Dom' || category === 'Int' || category === 'Both') {
    return CONTRACT_CATEGORY_LABELS[category];
  }
  return category;
}

export function formatPriceCardAirlineCategory(
  category: PriceCardAirlineCategory | string,
): string {
  if (category === 'Dom' || category === 'Int' || category === 'Ta') {
    return PRICE_CARD_AIRLINE_CATEGORY_LABELS[category];
  }
  return category;
}

export const CONTRACT_STATUSES = ['draft', 'active', 'expired'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Concessions-page fee scenarios (additive after Total Amount). */
export const CONTRACT_FEE_CONCESSION_SCENARIOS = [
  'int',
  'dom',
  'divertedDom',
  'divertedInt',
  'domesticCargo',
  'internationalCargo',
] as const;

/** Contracts-page conditional charge scenarios (chargeable % of BHS rate). */
export const CONTRACT_CONDITIONAL_CHARGE_SCENARIOS = [
  'divertedDom',
  'divertedInt',
  'returnToRamp',
  'originateTerminatePercent',
  'cancellationWithinHoursPercent',
  'technicalHandlingChargesPercent',
  'standbyChargesPercent',
  'filoLifoChargesPercent',
  'filoChargesPercent',
  'lifoChargesPercent',
  'ronAdditionalPercent',
  'lateArrivalAdditionalPercent',
  'extraGroundTimeAdditionalPercent',
  'splitIntArrivalDomDeparturePercent',
  'splitDomArrivalIntDeparturePercent',
] as const;

/** Invoice concession % by flight scenario — valid for contract priceValidFrom/To. */
export const CONTRACT_CONCESSION_SCENARIOS = [
  'int',
  'dom',
  'divertedDom',
  'divertedInt',
  'returnToRamp',
  'originateTerminatePercent',
  'cancellationWithinHoursPercent',
  'technicalHandlingChargesPercent',
  'standbyChargesPercent',
  'filoLifoChargesPercent',
  'filoChargesPercent',
  'lifoChargesPercent',
  'ronAdditionalPercent',
  'lateArrivalAdditionalPercent',
  'extraGroundTimeAdditionalPercent',
  'splitIntArrivalDomDeparturePercent',
  'splitDomArrivalIntDeparturePercent',
  'domesticCargo',
  'internationalCargo',
] as const;
export type ContractConcessionScenario = (typeof CONTRACT_CONCESSION_SCENARIOS)[number];

export const CONTRACT_CONCESSION_SCENARIO_LABELS: Record<ContractConcessionScenario, string> = {
  int: 'International flight',
  dom: 'Domestic flight',
  divertedDom: 'Diverted domestic',
  divertedInt: 'Diverted international',
  returnToRamp: 'Return to ramp',
  originateTerminatePercent: 'Originate / terminate',
  cancellationWithinHoursPercent: 'Cancellation within hours',
  technicalHandlingChargesPercent: 'Technical handling charges',
  standbyChargesPercent: 'Standby charges',
  filoLifoChargesPercent: 'FILO / LIFO charges',
  filoChargesPercent: 'Ferry in / live out',
  lifoChargesPercent: 'Live in / ferry out',
  ronAdditionalPercent: 'RON additional',
  lateArrivalAdditionalPercent: 'Late arrival additional',
  extraGroundTimeAdditionalPercent: 'Extra ground time additional',
  splitIntArrivalDomDeparturePercent: 'Int arrival / Dom departure',
  splitDomArrivalIntDeparturePercent: 'Dom arrival / Int departure',
  domesticCargo: 'Domestic cargo',
  internationalCargo: 'International cargo',
};

export const CONTRACT_CONCESSION_SCENARIO_HINTS: Record<ContractConcessionScenario, string> = {
  int: 'Scheduled international — % of total billing on final invoice',
  dom: 'Scheduled domestic — % of total billing on final invoice',
  divertedDom: 'Diverted domestic — % of total billing on final invoice',
  divertedInt: 'Diverted international — % of total billing on final invoice',
  returnToRamp: 'Return to ramp flights — % of total billing on final invoice',
  originateTerminatePercent:
    'ATA only (originate) or ATD only (terminate) — this percent of the BHS package rate is charged',
  cancellationWithinHoursPercent:
    'Cancelled within the contract window — % of total billing on final invoice',
  technicalHandlingChargesPercent:
    'Technical handling charges — % of total billing on final invoice',
  standbyChargesPercent: 'Standby charges — % of total billing on final invoice',
  filoLifoChargesPercent:
    'FILO or LIFO handling — this percent of the handling rate is charged',
  filoChargesPercent: 'Ferry in / live out — this percent of the handling rate is charged',
  lifoChargesPercent: 'Live in / ferry out — this percent of the handling rate is charged',
  ronAdditionalPercent: 'Remain overnight — this percent is added on top of the handling rate',
  lateArrivalAdditionalPercent:
    'Arrival more than 75 minutes after STA — this percent is added',
  extraGroundTimeAdditionalPercent:
    'Same-sector ground time beyond 75 minutes — this percent is added',
  splitIntArrivalDomDeparturePercent:
    'Delhi international arrival and domestic departure — this percent over the domestic comprehensive rate',
  splitDomArrivalIntDeparturePercent:
    'Delhi domestic arrival and international departure — this percent over the international comprehensive rate',
  domesticCargo: 'Domestic-Cargo flights (optional)',
  internationalCargo: 'International-Cargo flights (optional)',
};

export function emptyContractConcessionRates(): Record<ContractConcessionScenario, string> {
  return {
    int: '',
    dom: '',
    divertedDom: '',
    divertedInt: '',
    returnToRamp: '',
    originateTerminatePercent: '',
    cancellationWithinHoursPercent: '',
    technicalHandlingChargesPercent: '',
    standbyChargesPercent: '',
    filoLifoChargesPercent: '',
    filoChargesPercent: '',
    lifoChargesPercent: '',
    ronAdditionalPercent: '',
    lateArrivalAdditionalPercent: '',
    extraGroundTimeAdditionalPercent: '',
    splitIntArrivalDomDeparturePercent: '',
    splitDomArrivalIntDeparturePercent: '',
    domesticCargo: '',
    internationalCargo: '',
  };
}

export const PRICE_CARD_HANDLING_TYPES = ['BHS', 'ADS', 'RAF'] as const;
export type PriceCardHandlingType = (typeof PRICE_CARD_HANDLING_TYPES)[number];

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

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  draft: 'Draft',
  invited: 'Invited',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Invite expired',
};
