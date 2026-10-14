export * from './types';

export interface BillingSourceRow {
  sourceType: string;
  sourceRef: {
    serialNo?: string;
    flightNo?: string;
    usageRowId?: string;
    batchId?: string;
  };
  operationalData: Record<string, unknown>;
  billingEligibility: { eligible: boolean; reason?: string };
  contractMatch: {
    matched: boolean;
    contractId?: string;
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
  rateMatch: {
    matched: boolean;
    rateCardId?: string;
    unitPrice?: number;
    currency?: string;
    serviceCode?: string;
    message?: string;
  };
  validationStatus: {
    passed: boolean;
    errors: Array<{ rule: string; passed: boolean; message?: string }>;
  };
}

export interface BillingSourcesSummary {
  eligible: number;
  errors: number;
  ready: number;
  total: number;
}

export interface BillingSourcesResponse {
  rows: BillingSourceRow[];
  summary: BillingSourcesSummary;
  from: string;
  to: string;
  dateBasis?: string;
  sourceType: string;
}
