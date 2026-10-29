import type {
  ApprovalStatus,
  AuditAction,
  ContractCategory,
  ContractConcessionScenario,
  ContractStatus,
  CreditMemoReason,
  CreditMemoStatus,
  CurrencyCode,
  InvoiceStatus,
  KycDocumentType,
  KycStatus,
  PlaceOfSupply,
  PreparationSourceType,
  PreparationStatus,
  PriceCardHandlingType,
  PriceCardAirlineCategory,
  ServiceCatalogCategory,
} from './enums';

/** Mirrors FRIS StationScopeContext — replace with server import on integration. */
export interface StationScopeContext {
  stationCode?: string;
  crossStation: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
}

export interface ValidationResult {
  rule: string;
  passed: boolean;
  message?: string;
}

export interface PreparationCustomCheck {
  id: string;
  label: string;
  message?: string;
  passed: boolean;
}

export type PreparationWorkflowAudience = 'preparation' | 'draft_invoicing' | 'all';

export interface PreparationWorkflowNote {
  id: string;
  at: string;
  userId: string;
  userName: string;
  audience: PreparationWorkflowAudience;
  directedToUserId?: string;
  directedToUserName?: string;
  body: string;
  context?: string;
}

export interface BillingCustomerAnnexureFile {
  originalName: string;
  uploadedAt?: string;
}

export interface BillingCustomer {
  _id: string;
  customerCode: string;
  name: string;
  /** Printed under Bill to on the invoice when set. */
  airlineInvoiceName?: string;
  billToCustomerCode?: string;
  currencyCode: CurrencyCode;
  paymentTermsCode?: string;
  /** Invoice terms for this customer at this station only. */
  invoiceTerms?: string;
  gstRegistrationNo?: string;
  msmeRegistrationNo?: string;
  address?: string;
  secondaryAddressEnabled?: boolean;
  secondaryAddress?: string;
  gstBusPostingGroup?: string;
  genBusPostingGroup?: string;
  blocked: boolean;
  creditLimit?: number;
  globalDimension1?: string;
  globalDimension2?: string;
  stationCode: string;
  advanceAirlineId?: string;
  gatewayScheduledAirlineId?: string;
  flightNumber?: string;
  aircraftType?: string;
  scheduleLines?: Array<{ flightNumber: string; aircraftType?: string }>;
  /** Price card handling categories this airline belongs to (BHS, ADS, RAF). */
  priceCardHandlingTypes?: PriceCardHandlingType[];
  /** When true, print PAN on this airline's invoices. */
  showPanOnInvoice?: boolean;
  panNumber?: string;
  /** Customer's MSME / Udyam registration number, printed on invoices. */
  msmeNumber?: string;
  /** When true, print VAT number on this airline's invoices. */
  showVatOnInvoice?: boolean;
  vatNumber?: string;
  /** Saved annexure PDFs. The invoice page opens the file for ADS or BHS. */
  annexures?: {
    ads?: BillingCustomerAnnexureFile;
    bhs?: BillingCustomerAnnexureFile;
  } | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingContractClause {
  clauseType: string;
  label?: string;
  body: string;
  appliesTo: string[];
}

/** ADS equipment rule on a contract — free units per flight + charge rates. */
export interface BillingContractAdsEquipmentRule {
  serviceCode: string;
  /** Free quantity included per flight; extras are chargeable. */
  freePerFlight?: number;
  /** Wheelchair FOC for narrow-body flights (advance aircraft body = NB). */
  freePerFlightNb?: number;
  /** Wheelchair FOC for wide-body flights (advance aircraft body = WB). */
  freePerFlightWb?: number;
  /** Bill all used units even when listed in the BHS package. */
  alwaysChargeable?: boolean;
  /**
   * When false, this equipment is never ADS-charged for the selected aircraft
   * (any used quantity). Default / omitted = included for ADS billing.
   */
  includedForAds?: boolean;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  uom?: string;
  /** @deprecated Prefer aircraftTypes. */
  aircraftType?: string;
  /** Aircraft types this ADS rule applies to (empty = all on contract). */
  aircraftTypes?: string[];
  /**
   * Calendar month when this rule applies (`YYYY-MM`, e.g. `2026-06`).
   * Omitted legacy rules are treated as June 2026.
   */
  effectiveMonth?: string;
  category?: string;
  remarks?: string;
}

export interface BillingContractConcessionRates {
  int?: number;
  dom?: number;
  divertedDom?: number;
  divertedInt?: number;
  returnToRamp?: number;
  cancellationWithinHoursPercent?: number;
  technicalHandlingChargesPercent?: number;
  standbyChargesPercent?: number;
  filoLifoChargesPercent?: number;
  domesticCargo?: number;
  internationalCargo?: number;
}

/** Contracts-page optional terms — chargeable % of BHS package (Charged / Amount). */
export interface BillingContractConditionalCharges {
  divertedDom?: number;
  divertedInt?: number;
  returnToRamp?: number;
  /** ATA-only originate or ATD-only terminate: percent of the BHS package rate. */
  originateTerminatePercent?: number;
  cancellationWithinHoursPercent?: number;
  technicalHandlingChargesPercent?: number;
  standbyChargesPercent?: number;
  filoLifoChargesPercent?: number;
  filoChargesPercent?: number;
  lifoChargesPercent?: number;
  ronAdditionalPercent?: number;
  lateArrivalAdditionalPercent?: number;
  extraGroundTimeAdditionalPercent?: number;
  /** International arrival + domestic departure: % over the domestic comprehensive rate. */
  splitIntArrivalDomDeparturePercent?: number;
  /** Domestic arrival + international departure: % over the international comprehensive rate. */
  splitDomArrivalIntDeparturePercent?: number;
}

export interface BillingContractFortnightBillingRange {
  startDay: number;
  endDay: number;
  exchangeRatePerUsd?: number;
}

export interface BillingContractFortnightMonthRate {
  month: string;
  parts: Array<{ startDay: number; exchangeRatePerUsd: number }>;
}

export interface BillingKycFormData {
  legalName?: string;
  country?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  msme?: string;
  currencyCode?: CurrencyCode;
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
}

export interface BillingKycDocument {
  docType: KycDocumentType;
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface BillingKycOverrideEntry {
  at: string;
  byUserId?: string;
  byUserName?: string;
  reason: string;
  context?: string;
}

export interface BillingKycCase {
  _id: string;
  stationCode: string;
  customerCode: string;
  customerName?: string;
  status: KycStatus;
  form: BillingKycFormData;
  completenessPercent: number;
  inviteEmail?: string;
  inviteExpiresAt?: string;
  inviteSentAt?: string;
  inviteSentBy?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  overrideHistory?: BillingKycOverrideEntry[];
  documents: BillingKycDocument[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingContract {
  _id: string;
  contractNumber: string;
  customerCode: string;
  stationCode: string;
  category: ContractCategory;
  aircraftTypes?: string[];
  priceValidFrom: string;
  priceValidTo: string;
  /** True when the price card says the rate is open-ended. */
  openEnded?: boolean;
  /** Hours before STA within which cancellation concession applies. */
  cancellationWithinHours?: number;
  /** @deprecated Use concessionRates — legacy single % fallback. */
  royaltyAtGross?: number;
  royaltyInclusive?: boolean;
  /** Concession inside the BHS package, charged separately, or mixed by schedule type. */
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';
  /** Exclusive pricing only: royalty uses 18/(100−18) instead of 18/100. */
  extendedRoyaltyEnabled?: boolean;
  bhsConcessionNote?: string;
  /**
   * Fixed ceiling charge per scheduled flight. Applied on the airline invoice
   * in the matching billing currency.
   */
  ceilingRatePerFlightINR?: number;
  ceilingRatePerFlightUSD?: number;
  /** Concessions-page fee % added after Total Amount (by flight scenario). */
  concessionRates?: BillingContractConcessionRates;
  /** Contracts-page conditional chargeable % of BHS rate (diverted / RTR / …). */
  conditionalCharges?: BillingContractConditionalCharges;
  /** Other airlines billed from this contract and its rate cards. */
  additionalCustomerCodes?: string[];
  additionalCustomerInherit?: Array<{
    customerCode: string;
    concessions: boolean;
    rateCards: boolean;
    contract: boolean;
    conversionRates: boolean;
    customer: boolean;
  }>;
  categories?: Array<'Dom' | 'Int' | 'DomCargo' | 'IntCargo'>;
  /** Split one month into multiple invoice parts for this contract. */
  fortnightBillingEnabled?: boolean;
  fortnightEdgeDayCap?: boolean;
  /** Number of invoice parts when fortnight billing is enabled. */
  fortnightBillingPartCount?: number;
  /** Day ranges (1-31) used to split flights into separate invoices. */
  fortnightBillingRanges?: BillingContractFortnightBillingRange[];
  /** USD to INR rate for each part, for one calendar month only. */
  fortnightBillingMonthRates?: BillingContractFortnightMonthRate[];
  /**
   * Comprehensive volume bands. Marginal schedules replace the saved BHS rate
   * flight-by-flight for the month. Empty means the price card rate stands.
   */
  bhsVolumeSchedules?: BillingBhsVolumeSchedule[];
  xxlnClause?: string;
  delayClause?: string;
  clauses?: BillingContractClause[];
  /** Enable ADS conditions — free/always-chargeable equipment rules. */
  adsBillingEnabled?: boolean;
  /** When true, BME equipment is included on ADS invoices. Off leaves it unbilled. */
  billBmeEquipment?: boolean;
  /** USD invoices for the selected categories print an INR column beside USD. */
  inrUsdInvoiceEnabled?: boolean;
  inrUsdInvoiceCategories?: string[];
  /** Per-equipment ADS free allowance and unit rates (synced to rate cards). */
  adsEquipmentRules?: BillingContractAdsEquipmentRule[];
  /** Uploaded signed contract PDF (base64) for preview/download. */
  contractPdfFileName?: string;
  contractPdfContentType?: string;
  contractPdfBase64?: string;
  contractPdfUploadedAt?: string;
  flightsPerSchedule?: number;
  status: ContractStatus;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export const BHS_VOLUME_FLIGHT_SCOPES = [
  'domestic_t1',
  'domestic_t2',
  'international',
  'charter_domestic',
  'charter_international',
] as const;

export type BillingBhsVolumeFlightScope = (typeof BHS_VOLUME_FLIGHT_SCOPES)[number];

export type BillingBhsVolumeCarrierKind = 'any' | 'passenger' | 'freighter' | 'cargo';

export type BillingBhsVolumeAllocation = 'marginal' | 'flat';

export interface BillingBhsVolumeBand {
  fromCount: number;
  toCount?: number | null;
  unitPriceINR: number;
}

export interface BillingBhsVolumeSchedule {
  chargeKind: 'comprehensive' | 'ramp';
  flightScope: BillingBhsVolumeFlightScope;
  carrierKind?: BillingBhsVolumeCarrierKind;
  allocation: BillingBhsVolumeAllocation;
  overridesSavedRate?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  label?: string;
  note?: string;
  bands: BillingBhsVolumeBand[];
}

export interface BillingRateCard {
  _id: string;
  contractId: string;
  customerCode: string;
  serviceCode: string;
  /** Dom / Int flight category (BHS) or aircraft band (ADS/RAF). */
  category?: string;
  /** Aircraft type band — BHS service lists scoped per airline price card row. */
  aircraftType?: string;
  billingReference?: string;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  ceilingRateINR?: number;
  ceilingRateUSD?: number;
  currency: CurrencyCode;
  uom: string;
  minBillableUnits?: number;
  discountPercent?: number;
  discountDelayPercent?: number;
  royaltyRate?: number;
  remarks?: string;
  /** inclusive = in BHS package; exclusive = billed via ADS. */
  billingScope?: 'inclusive' | 'exclusive';
  /** Free units of this service per flight (ADS overage = used − free). */
  serviceCount?: number;
  /** Bill all used units on ADS even when listed in the BHS package. */
  alwaysChargeable?: boolean;
  /** Contract marked equipment as not included for ADS — never charge. */
  adsExcluded?: boolean;
  validFrom: string;
  validTo: string;
  stationCode: string;
}

export interface BillingPriceCardAirline {
  _id: string;
  handlingType: PriceCardHandlingType;
  customerCode: string;
  airlineName: string;
  validFrom: string;
  validTo: string;
  remarks?: string;
  aircraftType: string;
  category: PriceCardAirlineCategory;
  /** BHS handling — unit price per aircraft type. */
  price?: number;
  /** INR or USD from the station price card. */
  currencyCode?: string;
  /** True when the price card says the rate is open-ended. */
  openEnded?: boolean;
  /** BHS package applies to scheduled turnarounds or additional flights. Missing = scheduled. */
  flightOperation?: 'scheduled' | 'additional';
  /** Second same-day flight of this airline and aircraft uses incrementalPrice. */
  incrementalFlightsActive?: boolean;
  incrementalPrice?: number;
  stationCode: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingRafAdhocRate {
  _id: string;
  itemKind: 'equipment' | 'manpower' | 'service';
  label: string;
  remarks?: string;
  uom: string;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  percentValue?: number;
  validFrom: string;
  validTo: string;
  stationCode: string;
  sourceWorkbook?: string;
}

export interface BillingServiceCatalogItem {
  _id: string;
  serviceCode: string;
  description: string;
  lineType: 'service' | 'adjustment';
  category: ServiceCatalogCategory;
  uom: string;
  gstProdPostingGroup?: string;
  sacCode?: string;
  royaltyApplicable: boolean;
  active: boolean;
  exportLogType?: string;
}

export type BillingSetupStatus = 'complete' | 'partial' | 'missing';

export interface BillingSetupItemStatus {
  id: string;
  label: string;
  href: string;
  status: BillingSetupStatus;
  detail?: string;
}

export interface BillingOperationalSourceStatus {
  sourceType: string;
  label: string;
  href: string;
  eligible: number;
  pending: number;
  validationErrors: number;
  readyForInvoice: number;
  invoiced: number;
  rejected: number;
  total: number;
}

export interface BillingDashboardKpis {
  pendingPreparation: number;
  validationErrors: number;
  draftsAwaitingApproval: number;
  postedThisMonth: { count: number; totalInclTax: number };
  readyForInvoice: number;
  maker: {
    eligible: number;
    pending: number;
    validationErrors: number;
    rejected: number;
    readyForInvoice: number;
    invoiced: number;
    draftInvoices: number;
  };
  checker: {
    pendingApproval: number;
    approved: number;
    generated: number;
    postedThisMonth: number;
    postedTotalInclTax: number;
    creditMemosDraft: number;
    creditMemosPosted: number;
  };
  masterData: {
    stationCode: string;
    cutoverPhase: string;
    nativeBillingEnabled: boolean;
    customers: { total: number; active: number };
    serviceCatalog: { total: number; active: number };
    contracts: { total: number; active: number; draft: number };
    rateCards: number;
    taxRules: number;
    exchangeRates: number;
    sequences: { total: number; hasInvoice: boolean; hasCreditMemo: boolean };
    stationProfile: { status: BillingSetupStatus; missingFields: string[] };
    setupItems: BillingSetupItemStatus[];
    readinessPercent: number;
  };
  operationalSources: BillingOperationalSourceStatus[];
  recentActivity?: unknown[];
}

export interface BillingTaxRule {
  _id: string;
  ruleCode: string;
  gstPercent: number;
  placeOfSupply: PlaceOfSupply;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  serviceCodePattern?: string;
  customerGstGroup?: string;
  effectiveFrom: string;
  effectiveTo: string;
  stationCode: string;
}

export interface BillingExchangeRate {
  _id: string;
  currencyCode: string;
  rateToINR: number;
  startingDate: string;
  relationalRate?: number;
  source: 'manual' | 'rbi' | 'import';
  stationCode?: string;
}

export interface BillingSequence {
  _id: string;
  sequenceCode: string;
  prefix: string;
  currentValue: number;
  fiscalYear: string;
  documentType: 'invoice' | 'credit_memo';
  stationCode: string;
}

export interface BillingSettings {
  _id: string;
  stationCode: string;
  defaultPaymentTerms?: string;
  defaultGstGroup?: string;
  dimensionMappings?: { dimension1: string; dimension2: string };
  approvalRequired: boolean;
  monthCloseLockDay?: number;
  companyLegalEntity?: {
    name: string;
    address?: string;
    gstin?: string;
    logoUrl?: string;
  };
  nativeBillingEnabled?: boolean;
  cutoverPhase?: string;
  parallelRunStartDate?: string;
  bcReadOnlyDate?: string;
  frisPrimaryDate?: string;
}

export interface BillingPreparationRecord {
  _id: string;
  sourceType: PreparationSourceType;
  sourceRef: {
    serialNo?: string;
    flightNo?: string;
    batchId?: string;
    usageRowId?: string;
  };
  customerCode: string;
  customerName?: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: PreparationStatus;
  contractMatch?: {
    contractId?: string;
    rateCardId?: string;
    matched: boolean;
    cancellationWithinHours?: number;
    royaltyAtGross?: number;
    concessionRates?: BillingContractConcessionRates;
    conditionalCharges?: BillingContractConditionalCharges;
    message?: string;
  };
  rateMatch?: {
    serviceCode?: string;
    unitPrice?: number;
    currency?: CurrencyCode;
    matched: boolean;
  };
  validationResults: ValidationResult[];
  manualOverrides?: Record<string, boolean>;
  customChecks?: PreparationCustomCheck[];
  cancellationBilling?: {
    enabled?: boolean;
    bhsChargeablePercent?: number;
  };
  workflowNotes?: PreparationWorkflowNote[];
  invoiceDraftId?: string;
  operationalSnapshot?: Record<string, unknown>;
  stationCode: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingCustomBillOverrides {
  billToGstin?: string;
  billToPan?: string;
  billToStateCode?: string;
  placeOfSupply?: string;
  serviceStation?: string;
  serviceTableTitle?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BillingInvoiceHeader {
  _id: string;
  invoiceNumber?: string;
  draftNumber: string;
  customerCode: string;
  customerName: string;
  customerAddress?: string;
  customBillOverrides?: BillingCustomBillOverrides;
  status: InvoiceStatus;
  postingDate?: string;
  documentDate: string;
  currencyCode: CurrencyCode;
  currencyFactor: number;
  totalReceivableInUsd?: boolean;
  subtotalExclTax: number;
  /** Typed on the invoice edit screen. Missing means the contract percent is used. */
  concessionPercentOverride?: number | null;
  concessionFeePercent?: number;
  concessionFeeAmount?: number;
  taxTotal: number;
  totalInclTax: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** ADS fortnight display, e.g. `16-09-26 - 31-09-26`. */
  billingPeriodLabel?: string;
  /** Invoice family: BHS | ADS | RAF | MAAS | CUSTOM | OTHER */
  invoiceCategory?: string;
  /** Present when an ADS draft was separated into line combinations. */
  adsSplitFamilyId?: string;
  adsSplitGroupKey?: string;
  approvalStatus?: ApprovalStatus;
  inBin?: boolean;
  binnedAt?: string;
  binnedBy?: string;
  stationCode: string;
}

export interface BillingAuditLogEntry {
  _id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId: string;
  userName: string;
  timestamp: string;
  stationCode: string;
}

export interface BillingKycFormData {
  legalName?: string;
  country?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  msme?: string;
  currencyCode?: CurrencyCode;
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
}

export interface BillingKycDocument {
  docType: KycDocumentType;
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface BillingKycOverrideEntry {
  at: string;
  byUserId?: string;
  byUserName?: string;
  reason: string;
  context?: string;
}

export interface BillingKycCase {
  _id: string;
  stationCode: string;
  customerCode: string;
  customerName?: string;
  status: KycStatus;
  form: BillingKycFormData;
  completenessPercent: number;
  inviteEmail?: string;
  inviteExpiresAt?: string;
  inviteSentAt?: string;
  inviteSentBy?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  overrideHistory?: BillingKycOverrideEntry[];
  documents: BillingKycDocument[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
