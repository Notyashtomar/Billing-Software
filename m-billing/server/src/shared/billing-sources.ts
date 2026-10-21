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
    conditionalCharges?: {
      divertedDom?: number;
      divertedInt?: number;
      returnToRamp?: number;
      cancellationWithinHoursPercent?: number;
      technicalHandlingChargesPercent?: number;
      standbyChargesPercent?: number;
      filoLifoChargesPercent?: number;
      delayChargesPercent?: number;
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
    /** ADS: units used before free allowance */
    usedUnits?: number;
    /** ADS: free units from exclusive rate-card serviceCount */
    freeAllowance?: number;
    /** ADS: pricing source */
    pricingBasis?: 'rate_card' | 'adhoc' | 'row' | 'bhs_package' | 'package_inclusive' | 'ads_excluded' | 'not_on_contract' | 'custom';
    particular?: string;
    aircraftType?: string;
    uom?: string;
    /** Set when BME equipment is withheld from ADS because the contract toggle is off. */
    omitBmeFromAds?: boolean;
    /** Second same-day flight of this airline and aircraft uses incrementalPrice. */
    incrementalFlightsActive?: boolean;
    incrementalPrice?: number;
  };
  validationStatus: {
    passed: boolean;
    errors: Array<{ rule: string; passed: boolean; message?: string }>;
  };
  /** True when this flight is already in preparation for the billing period start. */
  sentToPreparation?: boolean;
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
