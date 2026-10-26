import type {
  ApprovalStatus,
  AuditAction,
  ContractCategory,
  ContractStatus,
  CreditMemoReason,
  CreditMemoStatus,
  CurrencyCode,
  InvoiceStatus,
  PlaceOfSupply,
  PreparationSourceType,
  PreparationStatus,
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

export interface BillingCustomer {
  _id: string;
  customerCode: string;
  name: string;
  airlineInvoiceName?: string;
  billToCustomerCode?: string;
  currencyCode: CurrencyCode;
  paymentTermsCode?: string;
  gstRegistrationNo?: string;
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
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingContract {
  _id: string;
  contractNumber: string;
  customerCode: string;
  additionalCustomerCodes?: string[];
  additionalCustomerInherit?: Array<{
    customerCode: string;
    concessions: boolean;
    rateCards: boolean;
    contract: boolean;
    conversionRates: boolean;
    customer: boolean;
  }>;
  stationCode: string;
  category: ContractCategory;
  categories?: Array<'Dom' | 'Int' | 'DomCargo' | 'IntCargo'>;
  aircraftTypes?: string[];
  priceValidFrom: string;
  priceValidTo: string;
  royaltyAtGross?: number;
  royaltyInclusive?: boolean;
  /** Concession already inside the BHS package, charged separately, or mixed. */
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';
  extendedRoyaltyEnabled?: boolean;
  bhsConcessionNote?: string;
  fortnightBillingEnabled?: boolean;
  fortnightEdgeDayCap?: boolean;
  fortnightBillingPartCount?: number;
  fortnightBillingRanges?: Array<{
    startDay: number;
    endDay: number;
    exchangeRatePerUsd?: number;
  }>;
  xxlnClause?: string;
  delayClause?: string;
  flightsPerSchedule?: number;
  status: ContractStatus;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRateCard {
  _id: string;
  contractId: string;
  customerCode: string;
  serviceCode: string;
  category?: string;
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
  validFrom: string;
  validTo: string;
  stationCode: string;
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
  /** GST state code printed on tax invoice (e.g. 33 for Tamil Nadu). */
  gstStateCode?: string;
  companyLegalEntity?: {
    name: string;
    address?: string;
    gstin?: string;
    pan?: string;
    cin?: string;
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
    concessionRates?: {
      int?: number;
      dom?: number;
      divertedDom?: number;
      divertedInt?: number;
      returnToRamp?: number;
      cancellationWithinHoursPercent?: number;
      technicalHandlingChargesPercent?: number;
      standbyChargesPercent?: number;
      filoLifoChargesPercent?: number;
      delayChargesPercent?: number;
      domesticCargo?: number;
      internationalCargo?: number;
    };
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

export interface BillingInvoiceHeader {
  _id: string;
  invoiceNumber?: string;
  draftNumber: string;
  customerCode: string;
  customerName: string;
  customerAddress?: string;
  status: InvoiceStatus;
  postingDate?: string;
  documentDate: string;
  currencyCode: CurrencyCode;
  currencyFactor: number;
  totalReceivableInUsd?: boolean;
  subtotalExclTax: number;
  taxTotal: number;
  totalInclTax: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  invoiceCategory?: string;
  adsSplitFamilyId?: string;
  adsSplitGroupKey?: string;
  approvalStatus?: ApprovalStatus;
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
