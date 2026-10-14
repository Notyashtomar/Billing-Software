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

export interface BillingCustomer {
  _id: string;
  customerCode: string;
  name: string;
  airlineInvoiceName?: string;
  billToCustomerCode?: string;
  currencyCode: CurrencyCode;
  paymentTermsCode?: string;
  invoiceTerms?: string;
  address?: string;
  secondaryAddressEnabled?: boolean;
  secondaryAddress?: string;
  gstRegistrationNo?: string;
  gstBusPostingGroup?: string;
  genBusPostingGroup?: string;
  blocked: boolean;
  creditLimit?: number;
  globalDimension1?: string;
  globalDimension2?: string;
  stationCode: string;
  advanceAirlineId?: string;
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
  cancellationWithinHours?: number;
  royaltyAtGross?: number;
  royaltyInclusive?: boolean;
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed';
  extendedRoyaltyEnabled?: boolean;
  bhsConcessionNote?: string;
  fortnightBillingEnabled?: boolean;
  fortnightEdgeDayCap?: boolean;
  fortnightBillingPartCount?: number;
  fortnightBillingRanges?: Array<{ startDay: number; endDay: number }>;
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

export interface BillingDashboardKpis {
  pendingPreparation: number;
  validationErrors: number;
  draftsAwaitingApproval: number;
  postedThisMonth: { count: number; totalInclTax: number };
  readyForInvoice: number;
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
  status: InvoiceStatus;
  postingDate?: string;
  documentDate: string;
  currencyCode: CurrencyCode;
  currencyFactor: number;
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
